const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const Employee = require('../models/Employee');

router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const emp = await Employee.findById(req.user.id);
    if (!emp) return res.status(404).json({ error: 'Not found.' });
    res.json(emp);
  } catch (err) {
    next(err);
  }
});

router.put('/profile', authenticate, async (req, res, next) => {
  try {
    // Employees can only update phone
    const { phone } = req.body;
    const updated = await Employee.update(req.user.id, { phone });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Employee can update their own shift
router.put('/my-shift', authenticate, async (req, res, next) => {
  try {
    const { shift_id } = req.body;
    if (!shift_id) return res.status(400).json({ error: 'shift_id is required.' });
    const updated = await Employee.update(req.user.id, { shift_id: parseInt(shift_id, 10) });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// All employees can list shifts (non-admin)
const Shift = require('../models/Shift');
router.get('/shifts', authenticate, async (req, res, next) => {
  try {
    const shifts = await Shift.findAll();
    res.json(shifts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
