'use strict';

/**
 * Migration — reconcile duplicate User.phone values before adding the
 * unique sparse index on { phone: 1 }.
 *
 * MODES
 *   node scripts/migrations/2026-05-user-phone-unique.js          # dry-run: list duplicates only
 *   node scripts/migrations/2026-05-user-phone-unique.js --apply  # nulls out older duplicate phones (keeps newest)
 *
 * STRATEGY
 *   - Find every phone value held by >1 user.
 *   - Sort the duplicates by createdAt DESC; KEEP the newest (latest signup);
 *     NULL out the phone field on the older sibling(s). The kept user retains
 *     ownership of that phone for login lookups; the others become phone-less
 *     and can re-add a phone via PATCH /v2/me.
 *
 * DEFENSIVE LOGGING
 *   Every action is logged to stdout with the user _id, email (or first 4
 *   chars), createdAt, and the action taken (kept | nulled).
 *
 * SAFETY
 *   - Dry-run by default; --apply required to mutate.
 *   - Connects via MONGODB_URI; refuses to run if the env var is missing.
 *   - Operates only on users where phone is a non-empty string.
 *
 * AFTER RUN
 *   Once dry-run + --apply both report zero remaining duplicates, deploy can
 *   proceed. Mongoose will build the new unique sparse index on startup.
 */

const mongoose = require('mongoose');

async function main() {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set — refusing to run.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const User = require('../../src/models/User');

    const dupes = await User.aggregate([
        { $match: { phone: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$phone', count: { $sum: 1 }, users: { $push: { id: '$_id', email: '$email', createdAt: '$createdAt' } } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
    ]);

    if (dupes.length === 0) {
        console.log('No duplicate phones found. Index can be added safely.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Found ${dupes.length} phone numbers with duplicates.`);
    let totalNulled = 0;

    for (const group of dupes) {
        const sorted = group.users.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const keep = sorted[0];
        const drop = sorted.slice(1);

        console.log(`Phone ${group._id}:`);
        console.log(`  KEEP   user=${keep.id} email=${keep.email || '(none)'} createdAt=${keep.createdAt}`);
        for (const u of drop) {
            console.log(`  ${apply ? 'NULL  ' : 'WOULD '} user=${u.id} email=${u.email || '(none)'} createdAt=${u.createdAt}`);
            if (apply) {
                await User.updateOne({ _id: u.id }, { $set: { phone: null } });
                totalNulled += 1;
            }
        }
    }

    if (apply) {
        console.log(`\nApplied. Total phones nulled: ${totalNulled}. Re-run dry-run to confirm zero remaining.`);
    } else {
        console.log('\nDRY RUN — no changes made. Re-run with --apply to null older duplicate phones.');
    }

    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

module.exports = main;
