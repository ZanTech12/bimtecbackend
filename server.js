const express = require('express');
const prisma = require('./config/db'); // 👈 Import Prisma instance
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path'); // 👈 Added to handle file paths for uploads
require('dotenv').config();

// Initialize Express App
const app = express();

// ===================================================================
// *** 1. CORS CONFIGURATION ***
// ===================================================================
const allowedOrigins = process.env.CLIENT_URLS 
    ? process.env.CLIENT_URLS.split(',') 
    : ['http://localhost:3000','http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173'];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
        if (origin.includes('lvh.me') || origin.includes('nip.io')) return callback(null, true);
        if (origin.includes('bimtechsolutions.com.ng')) return callback(null, true);

        console.log(`🚫 Blocked by CORS: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ===================================================================
// *** 2. GLOBAL MIDDLEWARES ***
// ===================================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===================================================================
// *** 3. DATABASE CONNECTION ***
// ===================================================================
async function connectDB() {
    try {
        await prisma.$connect();
        console.log('✅ PostgreSQL Database connected successfully!');
    } catch (err) {
        console.error('❌ PostgreSQL Connection Error:', err);
        process.exit(1);
    }
};

// ===================================================================
// *** 4. IMPORT ROUTES ***
// ===================================================================
const authRoutes = require('./routes/authRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');

const dashboardRoutes = require('./routes/dashboardRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const classRoutes = require('./routes/classRoutes');

const studentRoutes = require('./routes/studentRoutes');
const studentFeesRoutes = require('./routes/studentFeesRoutes');
const studentTestRoutes = require('./routes/studentTestRoutes');

const testRoutes = require('./routes/testRoutes');
const testResultRoutes = require('./routes/testResultRoutes');
const questionSetRoutes = require('./routes/questionSetRoutes');
const studentSubmissionRoutes = require('./routes/studentSubmissionRoutes');

const questionUploadRoutes = require('./routes/questionUploadRoutes');

const classTeacherCommentRoutes = require('./routes/classTeacherCommentRoutes');
const teacherAssignmentRoutes = require('./routes/teacherAssignmentRoutes');
const principalCommentRoutes = require('./routes/principalCommentRoutes');
const teacherCommentRoutes = require('./routes/teacherCommentRoutes');

const sessionRoutes = require('./routes/sessionRoutes');
const termRoutes = require('./routes/termRoutes');
const gradingSystemRoutes = require('./routes/gradingSystemRoutes');
const continuousAssessmentRoutes = require('./routes/continuousAssessmentRoutes');

const adminUtilityRoutes = require('./routes/adminUtilityRoutes');
const adminCaRoutes = require('./routes/adminCaRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const diagnosticRoutes = require('./routes/diagnosticRoutes');

const attendanceRoutes = require('./routes/attendanceRoutes');
const reportCardRoutes = require('./routes/reportCardRoutes');

const publicRoutes = require('./routes/publicRoutes');

const studentResultRoutes = require('./routes/studentResultRoutes');
const adminStudentBlockRoutes = require('./routes/adminStudentBlockRoutes');

const siteInfoRoutes = require('./routes/siteInformationRoutes');
const resultScheduleRoutes = require('./routes/resultScheduleRoutes');

const broadsheetRoutes = require('./routes/broadsheetRoutes');

const adminCaManagementRoutes = require('./routes/adminCaManagementRoutes');
const adminScoresRoutes = require('./routes/adminScoresRoutes');
const scoreManagementRoutes = require('./routes/scoreManagementRoutes');

// ✅ E-Notes Routes
const eNoteRoutes = require('./routes/eNoteRoutes');

// ===================================================================
// *** 5. MOUNT ROUTES ***
// ===================================================================
app.get('/', (req, res) => res.json({ success: true, message: 'School Management API is running...' }));

app.use('/login', authRoutes);
app.use('/superadmin', superAdminRoutes);
app.use(express.static('public'));

app.use('/dashboard', dashboardRoutes);
app.use('/teachers', teacherRoutes);
app.use('/subjects', subjectRoutes);
app.use('/classes', classRoutes);

app.use('/students', studentRoutes);
app.use('/students', studentFeesRoutes);
app.use('/student', studentTestRoutes);

app.use('/tests', testRoutes);
app.use('/test-results', testResultRoutes);

app.use('/question-sets', questionUploadRoutes);
app.use('/question-sets', questionSetRoutes);

app.use('/student-submissions', studentSubmissionRoutes);

app.use('/class-teacher-comments', classTeacherCommentRoutes);
app.use('/teacher-assignments', teacherAssignmentRoutes);
app.use('/principal-comments', principalCommentRoutes);
app.use('/teacher-comments', teacherCommentRoutes);

app.use('/sessions', sessionRoutes);
app.use('/terms', termRoutes);
app.use('/grading-systems', gradingSystemRoutes);
app.use('/continuous-assessments', continuousAssessmentRoutes);

app.use('/admin/ca', adminCaRoutes);
app.use('/attendance', attendanceRoutes);
app.use('/report-cards', reportCardRoutes);

app.use('/admin', adminUtilityRoutes);
app.use('/api', analyticsRoutes);
app.use('/public', publicRoutes);
app.use('/result-schedules', resultScheduleRoutes);

// ✅ FIXED: Mounting E-Notes Routes HIGH UP, ABOVE the root-mounted ('/') routers!
app.use('/e-notes', eNoteRoutes);

// --- Root mounted routes (These must be LAST so they don't block specific routes) ---
app.use('/', diagnosticRoutes); // 🚨 This was previously catching /e-notes!
app.use('/', studentResultRoutes);
app.use('/site-information', siteInfoRoutes);
app.use('/', adminStudentBlockRoutes);
app.use('/', broadsheetRoutes);
app.use('/', adminCaManagementRoutes);
app.use('/', adminScoresRoutes);
app.use('/', scoreManagementRoutes);

// ===================================================================
// *** 6. GLOBAL ERROR HANDLER ***
// ===================================================================
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error('Global Error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
});

// ===================================================================
// *** 7. AUTOMATIC SUPERADMIN INITIALIZATION ***
// ===================================================================
const initializeSuperAdmin = async () => {
    try {
        const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
        const email = process.env.SUPERADMIN_EMAIL || 'superadmin@yourschool.com';
        const password = process.env.SUPERADMIN_PASSWORD || 'SuperSecretPassword123';

        const superAdminExists = await prisma.superAdmin.findUnique({ where: { username } });

        if (!superAdminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            await prisma.superAdmin.create({
                data: {
                    username,
                    email,
                    password: hashedPassword
                }
            });
            
            console.log('✅ Default SuperAdmin created successfully!');
            console.log(`   Username: ${username}`);
            console.log(`   Email: ${email}`);
        }
    } catch (error) {
        console.error('❌ Error initializing SuperAdmin:', error.message);
    }
};

// ===================================================================
// *** 8. START SERVER ***
// ===================================================================
const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
    await initializeSuperAdmin();
    app.listen(PORT, () => {
        console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
        console.log(`🌐 Allowed CORS Origins: ${allowedOrigins.join(', ')}`);
    });
});