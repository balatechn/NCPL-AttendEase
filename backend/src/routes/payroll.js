const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/payrollController');

// All payroll routes require authentication
router.use(authenticate);

// ---- Employee self-service (any authenticated user, ownership enforced in controller) ----
router.get('/my/payslips', ctrl.getMyPayslips);
router.get('/my/payslips/:id/pdf', ctrl.getMyPayslipPdf);

// ---- Admin / HR only ----
router.use(authorize('admin', 'hr'));

// Settings (company + statutory config)
router.get('/settings', ctrl.getSettings);
router.put('/settings', ctrl.updateSettings);

// Salary structures
router.get('/salary-structures', ctrl.listSalaryStructures);
router.get('/salary-structures/:employeeId', ctrl.getStructureHistory);
router.post('/salary-structures', ctrl.saveSalaryStructure);

// Payroll runs (draft -> finalize)
router.get('/runs', ctrl.listRuns);
router.get('/runs/:id', ctrl.getRun);
router.post('/runs/draft', ctrl.generateDraft);
router.post('/runs/:id/finalize', ctrl.finalizeRun);
router.delete('/runs/:id', ctrl.deleteRun);

// Payslip edit + PDF
router.put('/payslips/:id', ctrl.updatePayslip);
router.get('/payslips/:id/pdf', ctrl.getPayslipPdf);

module.exports = router;
