'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../../utilities/logger');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Rich text editor image upload
 * @param {string} filePath - the filename of the uploaded file
 */
async function uploadEditorImage(filePath) {
    try {
        if (!filePath) {
            throw { status: 400, message: "Missing required file" };
        }
        return {
            uploaded: 1,
            url: `${BACKEND_URL}/uploads/EditorBodyImages/${filePath}`,
        };
    } catch (error) {
        if (error.status) throw error;
        logger.error({ err: error }, "Error uploading file:");
        throw { status: 500, message: "Failed to upload file" };
    }
}

/**
 * Delete uploaded editor image
 * @param {string} fileUrl - the full URL of the file to delete
 */
async function deleteEditorImage(fileUrl) {
    try {
        const extractFileName = (url) => {
            try {
                return path.basename(new URL(url).pathname);
            } catch {
                return null;
            }
        };

        const fileName = extractFileName(fileUrl);
        if (!fileName) {
            throw { status: 400, message: "Invalid URL: No filename found" };
        }

        const filePath = path.join(__dirname, '../../../uploads/EditorBodyImages', fileName);

        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            return { success: true, message: "File deleted successfully" };
        } else {
            throw { status: 404, message: "File not found on server" };
        }
    } catch (error) {
        if (error.status) throw error;
        logger.error({ err: error }, "Error deleting file:");
        throw { status: 500, message: error.message };
    }
}

module.exports = { uploadEditorImage, deleteEditorImage };
