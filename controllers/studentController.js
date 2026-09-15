console.log('🔥 studentController.js FILE LOADED SUCCESSFULLY!');

const prisma = require('../config/db');
const { getTenantFilter } = require('../utils/helpers');

// Helper to check for valid Int
const isValidId = (id) => {
    const parsed = parseInt(id);
    return !isNaN(parsed);
};

// ==========================================
// HELPER: Generate Custom Admission Number
// ==========================================
const generateCustomAdmissionNumber = async (adminId) => {
    const year = new Date().getFullYear();
    
    // 1. Atomically increment the counter
    const siteInfo = await prisma.siteInformation.upsert({
        where: { adminId },
        update: { admissionCounter: { increment: 1 } },
        create: { adminId, admissionCounter: 1 }
    });

    // 2. Get prefix (fallback to 'SCH' if not set yet)
    const prefix = siteInfo.admissionPrefix || 'SCH';
    
    // 3. Pad the number with leading zeros
    const paddedNumber = String(siteInfo.admissionCounter).padStart(3, '0');
    
    return `${prefix}/${year}/${paddedNumber}`;
};

// Helper to remove a student ID from a Class array (Prisma doesn't have $pull)
const removeStudentFromClass = async (classId, studentId) => {
    if (!classId) return;
    const classData = await prisma.class.findUnique({ where: { id: classId } });
    if (classData) {
        const updatedStudents = classData.students.filter(id => id !== studentId);
        await prisma.class.update({
            where: { id: classId },
            data: { students: { set: updatedStudents } }
        });
    }
};

// Helper to add a student ID to a Class array
const addStudentToClass = async (classId, studentId) => {
    if (!classId) return;
    const classData = await prisma.class.findUnique({ where: { id: classId } });
    if (classData && !classData.students.includes(studentId)) {
        await prisma.class.update({
            where: { id: classId },
            data: { students: { push: studentId } }
        });
    }
};

exports.getStudents = async (req, res) => {
    try {
        console.log('🚀 getStudents FUNCTION WAS CALLED!');
        
        const filter = { ...getTenantFilter(req), isDeleted: { not: true } };
        
        const students = await prisma.student.findMany({ where: filter });
        res.json({ success: true, data: students });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getStudentById = async (req, res) => {
    try {
        if (req.user.role === 'student' && parseInt(req.user.id) !== parseInt(req.params.id)) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only view your own profile.' });
        }

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid student ID format.' });

        const filter = { ...getTenantFilter(req), id: parseInt(req.params.id), isDeleted: { not: true } };
        const student = await prisma.student.findFirst({ where: filter });
        
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        res.json({ success: true, data: student });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.createStudent = async (req, res) => {
    try {
        const adminId = parseInt(req.user.id);
        const userRole = req.user.role;

        if (userRole !== 'superadmin') {
            const admin = await prisma.admin.findUnique({ where: { id: adminId } });
            if (!admin) return res.status(404).json({ success: false, message: 'Admin account not found.' });

            if (admin.currentStudentCount >= admin.studentLimit) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Student limit reached. Your limit is ${admin.studentLimit}. Please contact the Super Admin to increase it.` 
                });
            }
        }

        const admissionNumber = await generateCustomAdmissionNumber(adminId);
        
        // Extract classId and parse it to Int. Leave the rest of the body alone.
        const { admissionNumber: _, classId: rawClassId, ...studentDataWithoutAdmission } = req.body;
        const parsedClassId = rawClassId && isValidId(rawClassId) ? parseInt(rawClassId) : null;
        
        const studentData = { 
            ...studentDataWithoutAdmission, 
            admissionNumber,
            adminId: adminId,
            classId: parsedClassId // Explicitly pass the integer or null
        };
        
        const student = await prisma.student.create({ data: studentData });

        if (student.classId) {
            await addStudentToClass(student.classId, student.id);
        }

        if (userRole !== 'superadmin') {
            await prisma.admin.update({
                where: { id: adminId },
                data: { currentStudentCount: { increment: 1 } }
            });
        }

        res.status(201).json({ success: true, data: student, message: `Student registered with admission number: ${admissionNumber}` });
    } catch (error) {
        console.error('Create Student Error:', error);
        // Prisma unique constraint error is 'P2002'
        if (error.code === 'P2002' && error.meta.target.includes('admissionNumber')) {
            try {
                const admissionNumber = await generateCustomAdmissionNumber(adminId);
                const { admissionNumber: _, classId: rawClassId, ...studentDataWithoutAdmission } = req.body;
                const parsedClassId = rawClassId && isValidId(rawClassId) ? parseInt(rawClassId) : null;
                
                const studentData = { 
                    ...studentDataWithoutAdmission, 
                    admissionNumber,
                    adminId: adminId,
                    classId: parsedClassId
                };
                
                const student = await prisma.student.create({ data: studentData });

                if (student.classId) {
                    await addStudentToClass(student.classId, student.id);
                }

                if (req.user.role !== 'superadmin') {
                    await prisma.admin.update({
                        where: { id: adminId },
                        data: { currentStudentCount: { increment: 1 } }
                    });
                }

                return res.status(201).json({ success: true, data: student, message: `Student registered with admission number: ${admissionNumber}` });
            } catch (retryError) {
                return res.status(500).json({ success: false, message: 'Failed to generate unique admission number. Please try again.' });
            }
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateStudent = async (req, res) => {
    try {
        const { firstName, lastName, admissionNumber, classId: rawClassId, gender } = req.body;
        const tenantFilter = getTenantFilter(req);
        
        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid student ID format.' });
        const studentId = parseInt(req.params.id);
        
        const filter = { ...tenantFilter, id: studentId, isDeleted: { not: true } };
        const student = await prisma.student.findFirst({ where: filter });
        
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        if (admissionNumber && admissionNumber !== student.admissionNumber) {
            const existingStudent = await prisma.student.findFirst({ 
                where: { ...tenantFilter, admissionNumber, NOT: { id: studentId } } 
            });
            if (existingStudent) return res.status(400).json({ success: false, message: 'Admission number already exists' });
        }

        let oldClassId = student.classId;
        let newClassId = rawClassId && isValidId(rawClassId) ? parseInt(rawClassId) : null;

        const updatedStudent = await prisma.student.update({
            where: { id: studentId },
            data: { firstName, lastName, admissionNumber, classId: newClassId, gender }
        });

        if (oldClassId && oldClassId !== newClassId) {
            await removeStudentFromClass(oldClassId, studentId);
            if (newClassId) await addStudentToClass(newClassId, studentId);
        }

        res.json({ success: true, message: 'Student updated successfully', data: updatedStudent });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.softDeleteStudent = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
        }

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid student ID format.' });
        const tenantFilter = getTenantFilter(req);
        const studentId = parseInt(req.params.id);
        const student = await prisma.student.findFirst({ where: { ...tenantFilter, id: studentId } });
        
        if (!student || student.isDeleted) return res.status(404).json({ success: false, message: 'Student not found or already in recycle bin.' });

        await prisma.student.update({
            where: { id: studentId },
            data: { isDeleted: true }
        });

        await Promise.all([
            student.classId ? removeStudentFromClass(student.classId, studentId) : Promise.resolve(),
            prisma.continuousAssessment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } }),
            prisma.teacherComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.classTeacherComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } }),
            prisma.principalComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.attendance.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } }),
            prisma.studentSubmission.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: false } })
        ]);

        if (req.user.role === 'admin') {
            const admin = await prisma.admin.findUnique({ where: { id: parseInt(req.user.id) } });
            if (admin) {
                await prisma.admin.update({
                    where: { id: parseInt(req.user.id) },
                    data: { currentStudentCount: Math.max(0, admin.currentStudentCount - 1) }
                });
            }
        }

        res.json({ success: true, message: `Student "${student.firstName} ${student.lastName}" moved to Recycle Bin. All records have been hidden.` });
    } catch (error) {
        console.error('Soft Delete Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRecycleBin = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
        }
        
        const filter = { ...getTenantFilter(req), isDeleted: true };
        const deletedStudents = await prisma.student.findMany({ where: filter });
        
        res.json({ success: true, data: deletedStudents });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.restoreStudent = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
        }

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid student ID format.' });
        const tenantFilter = getTenantFilter(req);
        const studentId = parseInt(req.params.id);
        const student = await prisma.student.findFirst({ where: { ...tenantFilter, id: studentId } });
        
        if (!student || !student.isDeleted) return res.status(404).json({ success: false, message: 'Student not found in recycle bin.' });

        await prisma.student.update({
            where: { id: studentId },
            data: { isDeleted: false }
        });

        await Promise.all([
            student.classId ? addStudentToClass(student.classId, studentId) : Promise.resolve(),
            prisma.continuousAssessment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } }),
            prisma.teacherComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.classTeacherComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } }),
            prisma.principalComment.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.attendance.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } }),
            prisma.studentSubmission.updateMany({ where: { ...tenantFilter, studentId }, data: { isActive: true } })
        ]);

        if (req.user.role === 'admin') {
            await prisma.admin.update({
                where: { id: parseInt(req.user.id) },
                data: { currentStudentCount: { increment: 1 } }
            });
        }

        res.json({ success: true, message: `Student "${student.firstName} ${student.lastName}" and all associated records have been restored.` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.permanentDeleteStudent = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
        }

        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid student ID format.' });
        const tenantFilter = getTenantFilter(req);
        const studentId = parseInt(req.params.id);
        const student = await prisma.student.findFirst({ where: { ...tenantFilter, id: studentId } });
        
        if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

        await Promise.all([
            student.classId ? removeStudentFromClass(student.classId, studentId) : Promise.resolve(),
            prisma.continuousAssessment.deleteMany({ where: { ...tenantFilter, studentId } }),
            prisma.teacherComment.deleteMany({ where: { ...tenantFilter, studentId } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.classTeacherComment.deleteMany({ where: { ...tenantFilter, studentId } }),
            prisma.principalComment.deleteMany({ where: { ...tenantFilter, studentId } }),
            // 👈 FIXED: Changed student_id to studentId
            prisma.attendance.deleteMany({ where: { ...tenantFilter, studentId } }),
            prisma.studentSubmission.deleteMany({ where: { ...tenantFilter, studentId } })
        ]);

        await prisma.student.delete({ where: { id: studentId } });

        if (req.user.role === 'admin' && !student.isDeleted) {
            const admin = await prisma.admin.findUnique({ where: { id: parseInt(req.user.id) } });
            if (admin) {
                await prisma.admin.update({
                    where: { id: parseInt(req.user.id) },
                    data: { currentStudentCount: Math.max(0, admin.currentStudentCount - 1) }
                });
            }
        }

        res.json({ success: true, message: `Student "${student.firstName} ${student.lastName}" has been permanently deleted from the system.` });
    } catch (error) {
        console.error('Permanent Delete Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};