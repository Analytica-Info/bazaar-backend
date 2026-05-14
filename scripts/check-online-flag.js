require('dotenv').config();
const axios = require('axios');
const auth = { headers: { Authorization: `Bearer ${process.env.API_KEY}`, Accept: 'application/json' } };
const ID = '977e2b4a-f3f4-4ca5-82c4-171cf270c569';
(async () => {
  const v3 = (await axios.get(`https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${ID}`, auth)).data?.data;
  const v2 = (await axios.get(`https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${ID}`, auth)).data?.data;
  console.log('--- 3.0 (used by refresh path) ---');
  console.log({ ecwid_enabled_webstore: v3.ecwid_enabled_webstore, has_inventory: v3.has_inventory, is_active: v3.is_active });
  console.log('--- 2.0 (used by webhook path) ---');
  if (Array.isArray(v2)) console.log('(array shape)', v2.slice(0,1));
  else console.log({ ecwid_enabled_webstore: v2?.ecwid_enabled_webstore, has_inventory: v2?.has_inventory, is_active: v2?.is_active, raw_keys_with_web: Object.keys(v2 || {}).filter(k=>/web|ecwid|online|sell|enabled/i.test(k)) });
})().catch(e => console.error(e.response?.data || e.message));
