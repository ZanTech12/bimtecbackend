const prisma = require('../config/db');
const { getTenantFilter } = require('../utils/helpers');

// ==========================================================
// HELPERS
// ==========================================================

// Deep-scan a Json media field for a usable URL/path
// (handles string, { url }, { filename }, nested shapes)
const findMediaPath = (value, depth = 0) => {
    if (value == null || depth > 4) return null;
    if (typeof value === 'string') {
        const v = value.trim();
        if (!v) return null;
        if (/^(https?:)?\/\//i.test(v) || v.startsWith('/')) return v;
        if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(v)) return v;
        return null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findMediaPath(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof value === 'object') {
        const keys = ['url', 'secure_url', 'location', 'path', 'src', 'file', 'filename', 'filePath'];
        for (const k of keys) {
            if (value[k] != null) {
                const found = findMediaPath(value[k], depth + 1);
                if (found) return found;
            }
        }
        for (const v of Object.values(value)) {
            const found = findMediaPath(v, depth + 1);
            if (found) return found;
        }
    }
    return null;
};

// Convert a stored (relative) path into an ABSOLUTE URL
// based on the current request's host — works on localhost AND production
const absoluteMediaUrl = (req, stored) => {
    const path = findMediaPath(stored);
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const base = `${req.protocol}://${req.get('host')}`;
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
};

// Attach absolute media urls to a SiteInformation row for the response
const withAbsoluteMedia = (req, info) => ({
    ...info,
    schoolLogo: { url: absoluteMediaUrl(req, info.schoolLogo) },
    principalSignature: { url: absoluteMediaUrl(req, info.principalSignature) },
    schoolStamp: { url: absoluteMediaUrl(req, info.schoolStamp) },
});

// Multer file → Json field shape { url: '/uploads/<file>' }
const fileToJson = (file) => (file ? { url: `/uploads/${file.filename}` } : undefined);

// Role guard
const requireAdminRole = (req, res) => {
    if (!['admin', 'superadmin'].includes(req.user?.role)) {
        res.status(403).json({ success: false, message: 'Access denied.' });
        return false;
    }
    return true;
};

// ==========================================================
// GET /site-information
// ==========================================================
exports.getSiteInfo = async (req, res) => {
    try {
        const tenantFilter = getTenantFilter(req);

        // Use findFirst because the tenantFilter might be an empty object for a superadmin
        const info = await prisma.siteInformation.findFirst({
            where: tenantFilter
        });

        // Return empty object if none exists yet (frontend handles this)
        if (!info) {
            return res.status(200).json({ success: true, data: {} });
        }

        // ✅ Media fields returned with ABSOLUTE urls for the current environment
        res.status(200).json({
            success: true,
            data: withAbsoluteMedia(req, info)
        });
    } catch (error) {
        console.error('Error fetching site info:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// ==========================================================
// PUT /site-information (Creates or Updates)
// ==========================================================
exports.upsertSiteInfo = async (req, res) => {
    try {
        const tenantFilter = getTenantFilter(req); // Get adminId filter

        // 1. Destructure fields that shouldn't be overwritten directly from the frontend
        // This prevents Prisma from crashing if the frontend sends id/createdAt as strings
        const { id, adminId: bodyAdminId, admissionCounter, createdAt, updatedAt, ...updateData } = req.body;

        // 2. If files were uploaded via multer, save their file paths
        //    (when no new file is sent, the key is absent → existing value is preserved by Prisma)
        if (req.files) {
            if (req.files.schoolLogo) {
                updateData.schoolLogo = fileToJson(req.files.schoolLogo[0]);
            }
            if (req.files.principalSignature) {
                updateData.principalSignature = fileToJson(req.files.principalSignature[0]);
            }
            if (req.files.schoolStamp) {
                updateData.schoolStamp = fileToJson(req.files.schoolStamp[0]);
            }
        }

        // 3. Resolve the adminId to upsert against
        //    - admin tokens → tenantFilter.adminId (their own school)
        //    - superadmin → explicit body adminId, else the first existing record
        let adminId = tenantFilter.adminId ?? (bodyAdminId != null ? parseInt(bodyAdminId) : undefined);
        if (adminId == null || !Number.isFinite(Number(adminId))) {
            const existing = await prisma.siteInformation.findFirst();
            adminId = existing?.adminId;
        }
        adminId = adminId != null ? Number(adminId) : null;

        if (!adminId) {
            return res.status(400).json({ success: false, message: 'Admin ID is required to save site information.' });
        }

        // 4. Prisma upsert: Updates if exists, creates if it doesn't
        const updatedInfo = await prisma.siteInformation.upsert({
            where: { adminId: adminId }, // Use the unique adminId field
            update: updateData, // Only update the fields provided in updateData
            create: {
                ...updateData, // Apply provided data
                adminId: adminId // Ensure adminId is attached on creation
            }
        });

        // ✅ Respond with ABSOLUTE urls so the settings page preview
        //    immediately shows the real server path (not a dead blob/relative URL)
        res.status(200).json({
            success: true,
            data: { ...withAbsoluteMedia(req, updatedInfo), _id: updatedInfo.id }, // Map _id for frontend
            message: 'Site information saved successfully'
        });
    } catch (error) {
        console.error('Error updating site info:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// ==========================================================
// DELETE /site-information
// ==========================================================
exports.deleteSiteInfo = async (req, res) => {
    try {
        const tenantFilter = getTenantFilter(req);

        if (tenantFilter.adminId) {
            try {
                await prisma.siteInformation.delete({
                    where: { adminId: tenantFilter.adminId }
                });
            } catch (err) {
                // Prisma throws P2025 if the record to delete is not found. We can safely ignore this.
                if (err.code !== 'P2025') throw err;
            }
        }

        res.status(200).json({
            success: true,
            message: 'Site information deleted'
        });
    } catch (error) {
        console.error('Error deleting site info:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};