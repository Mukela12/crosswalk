// Generated from specs/controls.json for the sign-in artwork (public reference data, no tenant data).
export const GRAPH = {
 "frameworks": [
  {
   "code": "SOC2",
   "name": "SOC 2",
   "version": "2017 TSC, 2022 points of focus"
  },
  {
   "code": "ISO27001",
   "name": "ISO/IEC 27001",
   "version": "2022"
  },
  {
   "code": "HIPAA",
   "name": "HIPAA Security Rule",
   "version": "45 CFR Part 164 Subpart C"
  },
  {
   "code": "PCIDSS",
   "name": "PCI DSS",
   "version": "4.0.1"
  }
 ],
 "controls": [
  {
   "code": "IAM-01",
   "title": "Multi-factor authentication",
   "refs": {
    "SOC2": [
     "CC6.1",
     "CC6.6"
    ],
    "ISO27001": [
     "8.5"
    ],
    "HIPAA": [
     "164.312(d)"
    ],
    "PCIDSS": [
     "8.4.1",
     "8.4.2",
     "8.4.3"
    ]
   }
  },
  {
   "code": "IAM-02",
   "title": "Approved access provisioning",
   "refs": {
    "SOC2": [
     "CC6.2",
     "CC6.3"
    ],
    "ISO27001": [
     "5.16",
     "5.18"
    ],
    "HIPAA": [
     "164.308(a)(4)(ii)(B)",
     "164.308(a)(4)(ii)(C)"
    ],
    "PCIDSS": [
     "7.2.2",
     "7.2.3",
     "8.2.4"
    ]
   }
  },
  {
   "code": "IAM-03",
   "title": "Periodic access reviews",
   "refs": {
    "SOC2": [
     "CC6.2",
     "CC6.3"
    ],
    "ISO27001": [
     "5.18"
    ],
    "HIPAA": [
     "164.308(a)(4)(ii)(C)"
    ],
    "PCIDSS": [
     "7.2.4",
     "7.2.5.1"
    ]
   }
  },
  {
   "code": "IAM-04",
   "title": "Access removal at termination",
   "refs": {
    "SOC2": [
     "CC6.2",
     "CC6.3"
    ],
    "ISO27001": [
     "5.18"
    ],
    "HIPAA": [
     "164.308(a)(3)(ii)(C)"
    ],
    "PCIDSS": [
     "8.2.5"
    ]
   }
  },
  {
   "code": "DP-01",
   "title": "Encryption at rest",
   "refs": {
    "SOC2": [
     "CC6.1"
    ],
    "ISO27001": [
     "8.24"
    ],
    "HIPAA": [
     "164.312(a)(2)(iv)"
    ],
    "PCIDSS": [
     "3.5.1"
    ]
   }
  },
  {
   "code": "DP-02",
   "title": "Encryption in transit",
   "refs": {
    "SOC2": [
     "CC6.7"
    ],
    "ISO27001": [
     "5.14",
     "8.24"
    ],
    "HIPAA": [
     "164.312(e)(2)(ii)"
    ],
    "PCIDSS": [
     "4.2.1"
    ]
   }
  },
  {
   "code": "DP-03",
   "title": "Secure data disposal",
   "refs": {
    "SOC2": [
     "CC6.5"
    ],
    "ISO27001": [
     "7.14",
     "8.10"
    ],
    "HIPAA": [
     "164.310(d)(2)(i)",
     "164.310(d)(2)(ii)"
    ],
    "PCIDSS": [
     "3.2.1",
     "9.4.7"
    ]
   }
  },
  {
   "code": "LOG-01",
   "title": "Centralized audit logging",
   "refs": {
    "SOC2": [
     "CC7.2"
    ],
    "ISO27001": [
     "8.15"
    ],
    "HIPAA": [
     "164.312(b)"
    ],
    "PCIDSS": [
     "10.2.1",
     "10.5.1"
    ]
   }
  },
  {
   "code": "LOG-02",
   "title": "Daily security log review",
   "refs": {
    "SOC2": [
     "CC7.2",
     "CC7.3"
    ],
    "ISO27001": [
     "8.16"
    ],
    "HIPAA": [
     "164.308(a)(1)(ii)(D)",
     "164.308(a)(5)(ii)(C)"
    ],
    "PCIDSS": [
     "10.4.1",
     "10.4.1.1"
    ]
   }
  },
  {
   "code": "CHG-01",
   "title": "Approved and tested changes",
   "refs": {
    "SOC2": [
     "CC8.1"
    ],
    "ISO27001": [
     "8.32"
    ],
    "PCIDSS": [
     "6.5.1"
    ]
   }
  },
  {
   "code": "CHG-02",
   "title": "Peer code review",
   "refs": {
    "SOC2": [
     "CC8.1"
    ],
    "ISO27001": [
     "8.28"
    ],
    "PCIDSS": [
     "6.2.3"
    ]
   }
  },
  {
   "code": "VUL-01",
   "title": "Vulnerability scanning",
   "refs": {
    "SOC2": [
     "CC7.1"
    ],
    "ISO27001": [
     "8.8"
    ],
    "PCIDSS": [
     "11.3.1",
     "11.3.2"
    ]
   }
  },
  {
   "code": "VUL-02",
   "title": "Security patching",
   "refs": {
    "SOC2": [
     "CC8.1"
    ],
    "ISO27001": [
     "8.8"
    ],
    "PCIDSS": [
     "6.3.3"
    ]
   }
  },
  {
   "code": "VUL-03",
   "title": "Malware protection",
   "refs": {
    "SOC2": [
     "CC6.8"
    ],
    "ISO27001": [
     "8.7"
    ],
    "HIPAA": [
     "164.308(a)(5)(ii)(B)"
    ],
    "PCIDSS": [
     "5.2.1",
     "5.3.1"
    ]
   }
  },
  {
   "code": "IR-01",
   "title": "Incident response plan",
   "refs": {
    "SOC2": [
     "CC7.3",
     "CC7.4",
     "CC7.5"
    ],
    "ISO27001": [
     "5.24",
     "5.26",
     "5.27"
    ],
    "HIPAA": [
     "164.308(a)(6)(ii)"
    ],
    "PCIDSS": [
     "12.10.1",
     "12.10.2"
    ]
   }
  },
  {
   "code": "BC-01",
   "title": "Continuity and recovery plan",
   "refs": {
    "SOC2": [
     "CC9.1",
     "A1.3"
    ],
    "ISO27001": [
     "5.29",
     "5.30"
    ],
    "HIPAA": [
     "164.308(a)(7)(ii)(B)",
     "164.308(a)(7)(ii)(C)",
     "164.308(a)(7)(ii)(D)"
    ]
   }
  },
  {
   "code": "BC-02",
   "title": "Data backups",
   "refs": {
    "SOC2": [
     "A1.2",
     "A1.3"
    ],
    "ISO27001": [
     "8.13"
    ],
    "HIPAA": [
     "164.308(a)(7)(ii)(A)"
    ]
   }
  },
  {
   "code": "VEN-01",
   "title": "Vendor risk assessment",
   "refs": {
    "SOC2": [
     "CC9.2"
    ],
    "ISO27001": [
     "5.19",
     "5.22"
    ],
    "PCIDSS": [
     "12.8.1",
     "12.8.3",
     "12.8.4"
    ]
   }
  },
  {
   "code": "VEN-02",
   "title": "Vendor security agreements",
   "refs": {
    "SOC2": [
     "CC9.2"
    ],
    "ISO27001": [
     "5.20"
    ],
    "HIPAA": [
     "164.308(b)(3)",
     "164.314(a)(2)(i)"
    ],
    "PCIDSS": [
     "12.8.2"
    ]
   }
  },
  {
   "code": "PPL-01",
   "title": "Pre-hire background checks",
   "refs": {
    "SOC2": [
     "CC1.4"
    ],
    "ISO27001": [
     "6.1"
    ],
    "HIPAA": [
     "164.308(a)(3)(ii)(B)"
    ],
    "PCIDSS": [
     "12.7.1"
    ]
   }
  },
  {
   "code": "PPL-02",
   "title": "Security awareness training",
   "refs": {
    "SOC2": [
     "CC2.2"
    ],
    "ISO27001": [
     "6.3"
    ],
    "HIPAA": [
     "164.308(a)(5)(i)",
     "164.308(a)(5)(ii)(A)"
    ],
    "PCIDSS": [
     "12.6.1",
     "12.6.3",
     "12.6.3.1"
    ]
   }
  },
  {
   "code": "GOV-01",
   "title": "Information security policy",
   "refs": {
    "SOC2": [
     "CC5.3"
    ],
    "ISO27001": [
     "5.1"
    ],
    "HIPAA": [
     "164.316(a)",
     "164.316(b)(2)(iii)"
    ],
    "PCIDSS": [
     "12.1.1",
     "12.1.2"
    ]
   }
  },
  {
   "code": "GOV-02",
   "title": "Annual risk assessment",
   "refs": {
    "SOC2": [
     "CC3.2"
    ],
    "HIPAA": [
     "164.308(a)(1)(ii)(A)",
     "164.308(a)(1)(ii)(B)"
    ]
   }
  },
  {
   "code": "GOV-03",
   "title": "Named security officer",
   "refs": {
    "SOC2": [
     "CC1.3"
    ],
    "ISO27001": [
     "5.2"
    ],
    "HIPAA": [
     "164.308(a)(2)"
    ],
    "PCIDSS": [
     "12.1.3",
     "12.1.4"
    ]
   }
  }
 ]
};
export const REQUIREMENT_COUNT = 113;
