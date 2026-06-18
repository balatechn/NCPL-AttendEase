const biometricService = require('../../services/biometricService');

describe('Biometric Service - Log Processing', () => {
  describe('processLogs', () => {
    it('should pair first and last punch for same employee and date', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T18:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result).toHaveLength(1);
      expect(result[0].employee_code).toBe('EMP001');
      expect(result[0].punch_in).toBe('09:00:00');
      expect(result[0].punch_out).toBe('18:00:00');
      expect(result[0].work_hours).toBe(9);
    });

    it('should handle missing punch-out', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result).toHaveLength(1);
      expect(result[0].punch_in).toBe('09:00:00');
      expect(result[0].punch_out).toBeNull();
      expect(result[0].has_missing_punch_out).toBe(true);
    });

    it('should handle duplicate log entries', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T09:00:01', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T13:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
        { log_time: '2026-04-10T18:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result).toHaveLength(1);
      // First punch = IN, Last punch = OUT
      expect(result[0].punch_in).toBe('09:00:00');
      expect(result[0].punch_out).toBe('18:00:00');
    });

    it('should group logs by employee and date', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T09:05:00', employee_code: 'EMP002', employee_name: 'Jane', direction: 0 },
        { log_time: '2026-04-10T18:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
        { log_time: '2026-04-10T17:30:00', employee_code: 'EMP002', employee_name: 'Jane', direction: 1 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result).toHaveLength(2);
    });

    it('should handle multiple days for same employee', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T18:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
        { log_time: '2026-04-11T09:30:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-11T17:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result).toHaveLength(2);
      expect(result[0].attendance_date).toBe('2026-04-10');
      expect(result[1].attendance_date).toBe('2026-04-11');
    });

    it('should calculate work hours correctly', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:15:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
        { log_time: '2026-04-10T17:45:00', employee_code: 'EMP001', employee_name: 'John', direction: 1 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result[0].work_hours).toBe(8.5);
    });

    it('should return empty array for no logs', () => {
      const result = biometricService.processLogs([]);
      expect(result).toHaveLength(0);
    });

    it('should set source to biometric', () => {
      const rawLogs = [
        { log_time: '2026-04-10T09:00:00', employee_code: 'EMP001', employee_name: 'John', direction: 0 },
      ];

      const result = biometricService.processLogs(rawLogs);
      expect(result[0].source).toBe('biometric');
    });
  });
});
