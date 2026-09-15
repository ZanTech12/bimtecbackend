const prisma = require('../config/db');

// Helper to check for valid Int
const isValidId = (id) => {
    const parsed = parseInt(id);
    return !isNaN(parsed);
};

// ===================================================================
// *** PUBLIC ROUTES (No Auth Required) ***
// ===================================================================

// @route   GET /public/terms
// @desc    Get all active terms for public result checking
exports.getPublicTerms = async (req, res) => {
    try {
        const { sessionId, status, adminId } = req.query;
        
        const query = { isActive: true };

        // Filter by school so public users only see the correct school's terms
        if (adminId && isValidId(adminId)) query.adminId = parseInt(adminId); 
        if (sessionId && isValidId(sessionId)) query.sessionId = parseInt(sessionId);
        if (status) query.status = status;

        const terms = await prisma.term.findMany({
            where: query,
            include: {
                session: {
                    select: { name: true } // Replaces .populate('session', 'name')
                }
            },
            orderBy: { startDate: 'desc' }
        });

        // Map to include _id for frontend consistency
        const responseData = terms.map(t => ({
            ...t,
            _id: t.id,
            session: t.session ? { ...t.session, _id: t.session.id } : null
        }));

        res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('Error fetching public terms:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// @route   GET /public/sessions
// @desc    Get all active sessions for public result checking
exports.getPublicSessions = async (req, res) => {
    try {
        const { adminId } = req.query;
        
        const query = { isActive: true };
        
        // Filter by school so public users only see the correct school's sessions
        if (adminId && isValidId(adminId)) query.adminId = parseInt(adminId);

        const sessions = await prisma.session.findMany({
            where: query,
            orderBy: { name: 'desc' }
        });

        // Map to include _id for frontend consistency
        const responseData = sessions.map(s => ({ ...s, _id: s.id }));

        res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('Error fetching public sessions:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};