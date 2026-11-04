// MITRE ATT&CK (enterprise) + MITRE ATLAS (AI systems) techniques used by Narc's security mapping.
export const TACTICS = [
  'Reconnaissance', 'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion',
  'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Exfiltration', 'Impact',
];

export const TECHNIQUES = {
  'T1595': { name: 'Active Scanning', tactic: 'Reconnaissance' },
  'T1190': { name: 'Exploit Public-Facing Application', tactic: 'Initial Access' },
  'T1189': { name: 'Drive-by Compromise', tactic: 'Initial Access' },
  'T1195.001': { name: 'Compromise Software Dependencies and Development Tools', tactic: 'Initial Access' },
  'T1195.002': { name: 'Compromise Software Supply Chain', tactic: 'Initial Access' },
  'T1078': { name: 'Valid Accounts', tactic: 'Initial Access' },
  'T1059': { name: 'Command and Scripting Interpreter', tactic: 'Execution' },
  'T1203': { name: 'Exploitation for Client Execution', tactic: 'Execution' },
  'T1204.001': { name: 'User Execution: Malicious Link', tactic: 'Execution' },
  'AML.T0051': { name: 'LLM Prompt Injection', tactic: 'Execution', atlas: true },
  'AML.T0053': { name: 'LLM Plugin Compromise', tactic: 'Execution', atlas: true },
  'T1098': { name: 'Account Manipulation', tactic: 'Persistence' },
  'T1068': { name: 'Exploitation for Privilege Escalation', tactic: 'Privilege Escalation' },
  'T1611': { name: 'Escape to Host', tactic: 'Privilege Escalation' },
  'AML.T0054': { name: 'LLM Jailbreak', tactic: 'Privilege Escalation', atlas: true },
  'T1550.001': { name: 'Use Alternate Authentication Material: Application Access Token', tactic: 'Defense Evasion' },
  'T1222': { name: 'File and Directory Permissions Modification', tactic: 'Defense Evasion' },
  'T1552.001': { name: 'Unsecured Credentials: Credentials In Files', tactic: 'Credential Access' },
  'T1552.004': { name: 'Unsecured Credentials: Private Keys', tactic: 'Credential Access' },
  'T1110.002': { name: 'Brute Force: Password Cracking', tactic: 'Credential Access' },
  'T1557': { name: 'Adversary-in-the-Middle', tactic: 'Credential Access' },
  'T1083': { name: 'File and Directory Discovery', tactic: 'Discovery' },
  'T1082': { name: 'System Information Discovery', tactic: 'Discovery' },
  'T1210': { name: 'Exploitation of Remote Services', tactic: 'Lateral Movement' },
  'T1213': { name: 'Data from Information Repositories', tactic: 'Collection' },
  'T1005': { name: 'Data from Local System', tactic: 'Collection' },
  'AML.T0057': { name: 'LLM Data Leakage', tactic: 'Exfiltration', atlas: true },
  'T1041': { name: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration' },
  'T1565.001': { name: 'Data Manipulation: Stored Data Manipulation', tactic: 'Impact' },
  'T1485': { name: 'Data Destruction', tactic: 'Impact' },
  'T1499': { name: 'Endpoint Denial of Service', tactic: 'Impact' },
  'T1133': { name: 'External Remote Services', tactic: 'Initial Access' }, 'T1199': { name: 'Trusted Relationship', tactic: 'Initial Access' },
  'T1566': { name: 'Phishing', tactic: 'Initial Access' }, 'T1566.002': { name: 'Phishing: Spearphishing Link', tactic: 'Initial Access' },
  'T1204': { name: 'User Execution', tactic: 'Execution' }, 'T1204.002': { name: 'User Execution: Malicious File', tactic: 'Execution' },
  'T1106': { name: 'Native API', tactic: 'Execution' }, 'T1053': { name: 'Scheduled Task/Job', tactic: 'Execution' },
  'T1136': { name: 'Create Account', tactic: 'Persistence' }, 'T1505.003': { name: 'Server Software Component: Web Shell', tactic: 'Persistence' },
  'T1548': { name: 'Abuse Elevation Control Mechanism', tactic: 'Privilege Escalation' }, 'T1055': { name: 'Process Injection', tactic: 'Privilege Escalation' },
  'T1562': { name: 'Impair Defenses', tactic: 'Defense Evasion' }, 'T1070': { name: 'Indicator Removal', tactic: 'Defense Evasion' }, 'T1550': { name: 'Use Alternate Authentication Material', tactic: 'Defense Evasion' },
  'T1552': { name: 'Unsecured Credentials', tactic: 'Credential Access' }, 'T1110': { name: 'Brute Force', tactic: 'Credential Access' }, 'T1110.001': { name: 'Brute Force: Password Guessing', tactic: 'Credential Access' },
  'T1539': { name: 'Steal Web Session Cookie', tactic: 'Credential Access' }, 'T1528': { name: 'Steal Application Access Token', tactic: 'Credential Access' }, 'T1606': { name: 'Forge Web Credentials', tactic: 'Credential Access' }, 'T1212': { name: 'Exploitation for Credential Access', tactic: 'Credential Access' }, 'T1003': { name: 'OS Credential Dumping', tactic: 'Credential Access' },
  'T1087': { name: 'Account Discovery', tactic: 'Discovery' }, 'T1046': { name: 'Network Service Discovery', tactic: 'Discovery' }, 'T1580': { name: 'Cloud Infrastructure Discovery', tactic: 'Discovery' },
  'T1021': { name: 'Remote Services', tactic: 'Lateral Movement' }, 'T1185': { name: 'Browser Session Hijacking', tactic: 'Collection' }, 'T1530': { name: 'Data from Cloud Storage', tactic: 'Collection' }, 'T1119': { name: 'Automated Collection', tactic: 'Collection' },
  'T1048': { name: 'Exfiltration Over Alternative Protocol', tactic: 'Exfiltration' }, 'T1567': { name: 'Exfiltration Over Web Service', tactic: 'Exfiltration' },
  'T1565': { name: 'Data Manipulation', tactic: 'Impact' }, 'T1531': { name: 'Account Access Removal', tactic: 'Impact' }, 'T1486': { name: 'Data Encrypted for Impact', tactic: 'Impact' }, 'T1498': { name: 'Network Denial of Service', tactic: 'Impact' }, 'T1496': { name: 'Resource Hijacking', tactic: 'Impact' }, 'T1490': { name: 'Inhibit System Recovery', tactic: 'Impact' },
  'AML.T0043': { name: 'Craft Adversarial Data', tactic: 'Defense Evasion', atlas: true }, 'AML.T0020': { name: 'Poison Training Data', tactic: 'Persistence', atlas: true }, 'AML.T0024': { name: 'Exfiltration via ML Inference API', tactic: 'Exfiltration', atlas: true },
};

export const techniqueUrl = (id) => (id.startsWith('AML.') ? `https://atlas.mitre.org/techniques/${id}` : `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`);
export const technique = (id, nameHint) => {
  const known = TECHNIQUES[id];
  if (known) return { id, ...known, url: techniqueUrl(id) };
  const parent = TECHNIQUES[id.split('.').slice(0, id.startsWith('AML.') ? 2 : 1).join('.')];
  return { id, name: nameHint || (parent ? `${parent.name} (sub-technique)` : id), tactic: parent?.tactic || 'Other', atlas: id.startsWith('AML.'), url: techniqueUrl(id) };
};
