const prisma = require('../config/db');
const { Prisma } = require('@prisma/client');
const { getTenantFilter } = require('../utils/helpers');

exports.addQuestionSetToTest = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
        
        const { testId, questionSetId } = req.body;
        const tenantFilter = getTenantFilter(req);
        
        const test = await prisma.test.findFirst({ where: { ...tenantFilter, id: parseInt(testId) } });
        const questionSet = await prisma.questionSet.findFirst({ where: { ...tenantFilter, id: parseInt(questionSetId) } });
        
        if (!test || !questionSet) return res.status(404).json({ success: false, message: 'Test or QuestionSet not found' });

        if (test.classId !== questionSet.classId || test.subjectId !== questionSet.subjectId) {
            return res.status(400).json({ success: false, message: 'QuestionSet is not compatible with this Test.' });
        }

        // In PostgreSQL/Prisma, JSON fields are saved directly
        await prisma.test.update({
            where: { id: test.id },
            data: { questions: questionSet.questions }
        });
        
        res.json({ success: true, message: 'Added questions successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.fixAllTests = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
        
        const tenantFilter = getTenantFilter(req);
        
        // Find tests with empty questions JSON
        const testsWithoutQuestions = await prisma.test.findMany({ 
            where: { 
                ...tenantFilter,
                OR: [
                    { questions: { equals: [] } },
                    { questions: { equals: Prisma.JsonNull } },
                    { questions: { equals: Prisma.DbNull } }
                ] 
            }
        });
        
        let fixedCount = 0;
        for (const test of testsWithoutQuestions) {
            const availableQuestions = await prisma.question.findMany({ 
                where: { 
                    ...tenantFilter, 
                    classId: test.classId, 
                    subjectId: test.subjectId 
                },
                take: 10 // equivalent to .slice(0, 10)
            });
            
            if (availableQuestions.length > 0) {
                const questionsJson = availableQuestions.map(q => ({ 
                    questionText: q.questionText, 
                    options: q.options, 
                    correctAnswer: q.correctAnswer, 
                    difficulty: q.difficulty, 
                    explanation: q.explanation 
                }));
                
                await prisma.test.update({
                    where: { id: test.id },
                    data: { questions: questionsJson }
                });
                fixedCount++;
            }
        }
        res.json({ success: true, message: `Fixed ${fixedCount} tests` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.fixTestDates = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
        
        const now = new Date();
        const tenantFilter = getTenantFilter(req);
        
        // Prisma's updateMany completely replaces the need for Mongoose's bulkWrite
        const result = await prisma.test.updateMany({
            where: { 
                ...tenantFilter, 
                isActive: true, 
                startDate: { gt: now } // $gt becomes gt
            },
            data: { 
                startDate: now 
            }
        });
        
        res.json({ success: true, message: `Updated ${result.count} tests to start today.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.extendAllTests = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Access denied.' });
        
        const { daysToExtend = 7 } = req.body;
        const now = new Date();
        const tenantFilter = getTenantFilter(req);
        
        const expiredTests = await prisma.test.findMany({ 
            where: { 
                ...tenantFilter, 
                endDate: { lt: now } // $lt becomes lt
            } 
        });

        // Use a transaction to update all tests dynamically
        const updatePromises = expiredTests.map(test => {
            const newEndDate = new Date(test.endDate);
            newEndDate.setDate(newEndDate.getDate() + daysToExtend);
            
            return prisma.test.update({
                where: { id: test.id },
                data: { endDate: newEndDate }
            });
        });

        // Execute all updates simultaneously and safely
        await prisma.$transaction(updatePromises);
        
        res.json({ success: true, message: `Extended ${expiredTests.length} tests by ${daysToExtend} days` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};