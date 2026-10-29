const router = require('express').Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');

router.use(auth, requireRole('EMPLOYEE'));

router.get('/me', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id },
      select: {
        employeeCode: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        department: true,
        performanceScore: true,
        status: true,
        createdAt: true,
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee profile not found' });
    res.json(employee);
  } catch (error) {
    console.error('Employee dashboard failed:', error);
    res.status(500).json({ message: 'Could not load employee dashboard' });
  }
});

module.exports = router;