'use strict';

const Admin = require('../../../repositories').admins.rawModel();

module.exports = async function getAllAdmins({ page, limit }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    const admins = await Admin.find()
        .populate('role', 'name description')
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

    const totalCount = await Admin.countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    if (admins.length === 0) {
        throw {
            status: 404,
            message: 'No admins found.',
            data: {
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalAdmins: 0,
                    adminsPerPage: limit,
                }
            }
        };
    }

    return {
        admins,
        pagination: {
            currentPage: page,
            totalPages,
            totalAdmins: totalCount,
            adminsPerPage: limit,
        },
    };
};
