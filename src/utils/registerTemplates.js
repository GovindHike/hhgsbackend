/**
 * Starter layouts for the statutory registers an office typically maintains.
 * They are only seeds for the field builder — once a register is created its
 * fields are fully editable and no longer tied back to the template.
 */
export const REGISTER_TEMPLATES = [
  {
    key: "employee-register",
    name: "Register of Employees",
    description: "Master record of every person employed, with identity, designation and exit details.",
    color: "#2563eb",
    fields: [
      { key: "employeeCode", label: "Employee Code", type: "text", required: true },
      { key: "employeeName", label: "Name of Employee", type: "text", required: true },
      { key: "fatherOrHusbandName", label: "Father's / Husband's Name", type: "text" },
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"] },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "designation", label: "Designation", type: "text" },
      { key: "department", label: "Department", type: "text" },
      { key: "dateOfJoining", label: "Date of Joining", type: "date", required: true },
      { key: "uanNumber", label: "UAN Number", type: "text" },
      { key: "esiNumber", label: "ESI Number", type: "text" },
      { key: "bankAccount", label: "Bank Account Number", type: "text", showInTable: false },
      { key: "address", label: "Present Address", type: "textarea", showInTable: false },
      { key: "dateOfExit", label: "Date of Exit", type: "date" },
      { key: "reasonForExit", label: "Reason for Exit", type: "textarea", showInTable: false }
    ]
  },
  {
    key: "attendance-register",
    name: "Attendance Register",
    description: "Daily attendance with in/out timings and hours worked.",
    color: "#0891b2",
    fields: [
      { key: "attendanceDate", label: "Date", type: "date", required: true },
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "inTime", label: "In Time", type: "time" },
      { key: "outTime", label: "Out Time", type: "time" },
      { key: "hoursWorked", label: "Hours Worked", type: "number" },
      { key: "overtimeHours", label: "Overtime Hours", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Present", "Absent", "Half Day", "Weekly Off", "Holiday", "On Leave"],
        required: true
      },
      { key: "remarks", label: "Remarks", type: "textarea", showInTable: false }
    ]
  },
  {
    key: "wages-register",
    name: "Register of Wages",
    description: "Wage period earnings, deductions and net pay for each employee.",
    color: "#059669",
    fields: [
      { key: "wagePeriod", label: "Wage Period", type: "text", required: true, placeholder: "e.g. Apr 2026" },
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "daysWorked", label: "Days Worked", type: "number" },
      { key: "basicWages", label: "Basic Wages", type: "currency" },
      { key: "hra", label: "HRA", type: "currency" },
      { key: "allowances", label: "Other Allowances", type: "currency" },
      { key: "overtimeWages", label: "Overtime Wages", type: "currency" },
      { key: "grossWages", label: "Gross Wages", type: "currency" },
      { key: "pfDeduction", label: "PF Deduction", type: "currency" },
      { key: "esiDeduction", label: "ESI Deduction", type: "currency" },
      { key: "professionalTax", label: "Professional Tax", type: "currency" },
      { key: "otherDeductions", label: "Other Deductions", type: "currency" },
      { key: "netWages", label: "Net Wages Paid", type: "currency", required: true },
      { key: "dateOfPayment", label: "Date of Payment", type: "date" }
    ]
  },
  {
    key: "leave-register",
    name: "Register of Leave with Wages",
    description: "Leave applied, sanctioned and balance carried forward.",
    color: "#7c3aed",
    fields: [
      { key: "employee", label: "Employee", type: "employee", required: true },
      {
        key: "leaveType",
        label: "Leave Type",
        type: "select",
        options: ["Earned Leave", "Casual Leave", "Sick Leave", "Maternity Leave", "Loss of Pay"],
        required: true
      },
      { key: "fromDate", label: "From Date", type: "date", required: true },
      { key: "toDate", label: "To Date", type: "date", required: true },
      { key: "daysAvailed", label: "Days Availed", type: "number" },
      { key: "leaveBalance", label: "Balance Leave", type: "number" },
      { key: "wagesPaid", label: "Wages Paid for Leave", type: "currency" },
      { key: "sanctionedBy", label: "Sanctioned By", type: "text" },
      { key: "remarks", label: "Remarks", type: "textarea", showInTable: false }
    ]
  },
  {
    key: "overtime-register",
    name: "Register of Overtime",
    description: "Overtime worked beyond normal hours and the overtime wages paid.",
    color: "#d97706",
    fields: [
      { key: "overtimeDate", label: "Date", type: "date", required: true },
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "normalHours", label: "Normal Hours Worked", type: "number" },
      { key: "overtimeHours", label: "Overtime Hours", type: "number", required: true },
      { key: "overtimeRate", label: "Overtime Rate per Hour", type: "currency" },
      { key: "overtimeWages", label: "Overtime Wages", type: "currency" },
      { key: "reason", label: "Reason for Overtime", type: "textarea", showInTable: false },
      { key: "datePaid", label: "Date Paid", type: "date" }
    ]
  },
  {
    key: "advances-register",
    name: "Register of Advances",
    description: "Advances paid to employees and the instalments recovered.",
    color: "#0d9488",
    fields: [
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "advanceDate", label: "Date of Advance", type: "date", required: true },
      { key: "advanceAmount", label: "Advance Amount", type: "currency", required: true },
      { key: "purpose", label: "Purpose", type: "textarea", showInTable: false },
      { key: "instalments", label: "Number of Instalments", type: "number" },
      { key: "instalmentAmount", label: "Instalment Amount", type: "currency" },
      { key: "amountRecovered", label: "Amount Recovered", type: "currency" },
      { key: "balanceOutstanding", label: "Balance Outstanding", type: "currency" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Open", "Partially Recovered", "Closed", "Written Off"]
      }
    ]
  },
  {
    key: "fines-register",
    name: "Register of Fines",
    description: "Fines imposed on employees with the act, cause and amount realised.",
    color: "#e11d48",
    fields: [
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "fineDate", label: "Date of Offence", type: "date", required: true },
      { key: "actOrOmission", label: "Act / Omission", type: "textarea", required: true },
      { key: "showCauseDate", label: "Date of Show Cause", type: "date" },
      { key: "explanation", label: "Explanation of Employee", type: "textarea", showInTable: false },
      { key: "wageRate", label: "Wage Rate", type: "currency" },
      { key: "fineAmount", label: "Amount of Fine", type: "currency", required: true },
      { key: "dateRealised", label: "Date Fine Realised", type: "date" },
      { key: "instalmentDetails", label: "Instalment Details", type: "text", showInTable: false }
    ]
  },
  {
    key: "damage-loss-register",
    name: "Register of Deductions for Damage or Loss",
    description: "Deductions recovered for damage or loss caused by neglect or default.",
    color: "#b45309",
    fields: [
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "damageDate", label: "Date of Damage / Loss", type: "date", required: true },
      { key: "particulars", label: "Particulars of Damage or Loss", type: "textarea", required: true },
      { key: "showCauseDate", label: "Date of Show Cause", type: "date" },
      { key: "explanation", label: "Explanation of Employee", type: "textarea", showInTable: false },
      { key: "deductionAmount", label: "Amount of Deduction", type: "currency", required: true },
      { key: "instalments", label: "Number of Instalments", type: "number" },
      { key: "dateRecovered", label: "Date of Recovery", type: "date" },
      { key: "remarks", label: "Remarks", type: "textarea", showInTable: false }
    ]
  },
  {
    key: "muster-roll",
    name: "Muster Roll",
    description: "Consolidated daily roll of persons employed for the wage period.",
    color: "#4f46e5",
    fields: [
      { key: "musterDate", label: "Date", type: "date", required: true },
      { key: "employee", label: "Employee", type: "employee", required: true },
      { key: "designation", label: "Designation", type: "text" },
      { key: "workLocation", label: "Place of Work", type: "text" },
      { key: "shift", label: "Shift", type: "select", options: ["Shift 1", "Shift 2", "General"] },
      {
        key: "attendanceMark",
        label: "Attendance Mark",
        type: "select",
        options: ["P", "A", "H", "WO", "L"],
        required: true
      },
      { key: "signature", label: "Signature / Thumb Impression Taken", type: "boolean" },
      { key: "remarks", label: "Remarks", type: "textarea", showInTable: false }
    ]
  },
  {
    key: "accident-register",
    name: "Register of Accidents",
    description: "Accidents and dangerous occurrences, the injury caused and compensation paid.",
    color: "#ea580c",
    fields: [
      { key: "accidentDate", label: "Date of Accident", type: "date", required: true },
      { key: "accidentTime", label: "Time of Accident", type: "time" },
      { key: "employee", label: "Employee Involved", type: "employee", required: true },
      { key: "place", label: "Place of Accident", type: "text" },
      { key: "natureOfInjury", label: "Nature of Injury", type: "textarea", required: true },
      {
        key: "severity",
        label: "Severity",
        type: "select",
        options: ["Minor", "Reportable", "Serious", "Fatal"]
      },
      { key: "causeOfAccident", label: "Cause of Accident", type: "textarea", showInTable: false },
      { key: "treatmentGiven", label: "Treatment Given", type: "textarea", showInTable: false },
      { key: "daysAbsent", label: "Days Absent", type: "number" },
      { key: "compensationPaid", label: "Compensation Paid", type: "currency" },
      { key: "reportedToAuthority", label: "Reported to Authority", type: "boolean" },
      { key: "dateOfReturn", label: "Date of Return to Work", type: "date" }
    ]
  }
];

export const getRegisterTemplate = (key) => REGISTER_TEMPLATES.find((template) => template.key === key) || null;
