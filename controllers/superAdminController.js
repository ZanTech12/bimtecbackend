const bcrypt = require('bcrypt');
const prisma = require('../config/db');

// Helper to check for valid Int
const isValidId = (id) => {
    const parsed = parseInt(id);
    return !isNaN(parsed);
};

// ===================================================================
// *** HELPER: Generate School Code from Full Name (e.g., mercycollege) ***
// ===================================================================
const generateSchoolCode = async (schoolName) => {
    if (!schoolName) return null;

    // 1. Convert to lowercase and remove spaces/special characters
    const baseSlug = schoolName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    
    let schoolCode = baseSlug;
    let counter = 1;
    
    // 2. Check if this exact code is already taken
    let existingSchool = await prisma.admin.findFirst({ where: { schoolCode } });
    
    // 3. If taken, append a number until we find a unique code
    while (existingSchool) {
        schoolCode = `${baseSlug}${counter}`;
        existingSchool = await prisma.admin.findFirst({ where: { schoolCode } });
        counter++;
    }
    
    return schoolCode;
};

// Get all School Admins (SuperAdmin only)
exports.getAllAdmins = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Access denied. Super Admin role required.' });

        const admins = await prisma.admin.findMany();
        
        // Map _id for frontend consistency and manually remove password
        const responseData = admins.map(a => {
            const adminObj = { ...a, _id: a.id };
            delete adminObj.password;
            return adminObj;
        });
        
        res.json({ success: true, data: responseData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Register a new School Admin (SuperAdmin only)
exports.createAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Access denied. Super Admin role required.' });

        const { username, password, name, schoolName, expiryDate } = req.body;
        
        let studentLimit = Number(req.body.studentLimit);
        if (Number.isNaN(studentLimit)) studentLimit = 0;

        const existingAdmin = await prisma.admin.findUnique({ where: { username } });
        if (existingAdmin) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const schoolCode = await generateSchoolCode(schoolName);

        const newAdmin = await prisma.admin.create({
            data: {
                username,
                password: hashedPassword,
                name,
                schoolName,
                schoolCode,
                studentLimit,
                expiryDate: new Date(expiryDate),
                isActive: true
            }
        });

        const adminResponse = { ...newAdmin, _id: newAdmin.id };
        delete adminResponse.password; // Safely remove password before sending

        // Construct the login link safely
        let origin = req.headers.origin || req.headers.referer;
        if (!origin) {
            origin = `${req.protocol}://${req.get('host')}`;
        }
        const loginUrl = `${origin.replace('://', `://${newAdmin.schoolCode.toLowerCase()}.`)}/login`;

        adminResponse.schoolCode = newAdmin.schoolCode;
        adminResponse.loginUrl = loginUrl;

        res.status(201).json({ 
            success: true, 
            data: adminResponse, 
            message: 'School Admin registered successfully' 
        });
    } catch (error) {
        console.error('Create Admin error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, message: 'Username already exists.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update School Admin (SuperAdmin only)
exports.updateAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Access denied. Super Admin role required.' });

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid admin ID format.' });
        const adminId = parseInt(req.params.id);

        const { name, schoolName, studentLimit, expiryDate, password, username } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (schoolName) updateData.schoolName = schoolName;
        if (studentLimit !== undefined) {
            let parsedLimit = Number(studentLimit);
            if (!Number.isNaN(parsedLimit)) updateData.studentLimit = parsedLimit;
        }
        if (username) updateData.username = username;
        if (expiryDate) updateData.expiryDate = new Date(expiryDate);

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateData.password = hashedPassword;
        }

        const updatedAdmin = await prisma.admin.update({
            where: { id: adminId },
            data: updateData
        });

        const adminResponse = { ...updatedAdmin, _id: updatedAdmin.id };
        delete adminResponse.password; // Safely remove password before sending

        res.json({ success: true, data: adminResponse, message: 'School Admin updated successfully' });
    } catch (error) {
        console.error('Update Admin error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, message: 'Username already exists. Please choose another.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// Activate/Deactivate School Admin (SuperAdmin only)
exports.toggleAdminStatus = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Access denied. Super Admin role required.' });

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid admin ID format.' });
        const adminId = parseInt(req.params.id);

        const admin = await prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        const updatedAdmin = await prisma.admin.update({
            where: { id: adminId },
            data: { 
                isActive: !admin.isActive,
                deactivatedAt: !admin.isActive ? new Date() : null
            }
        });
        
        const message = updatedAdmin.isActive ? 'School Admin activated successfully' : 'School Admin deactivated successfully';
        res.json({ success: true, data: { isActive: updatedAdmin.isActive }, message });
    } catch (error) {
        console.error('Toggle Admin error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete School Admin (SuperAdmin only)
exports.deleteAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Access denied. Super Admin role required.' });

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid admin ID format.' });
        const adminId = parseInt(req.params.id);

        try {
            await prisma.admin.delete({ where: { id: adminId } });
        } catch (err) {
            if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Admin not found' });
            throw err;
        }

        res.json({ success: true, message: 'School Admin deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};