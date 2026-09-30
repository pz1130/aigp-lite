import type { ReportTemplate } from "../types";

export const iso27001Template: ReportTemplate = {
  id: "iso-27001",
  displayKey: "reports.templates.iso27001",
  version: "2022",
  controls: [
    // ── A.5 Information Security Policies (Organizational) ─────────────────────
    {
      id: "A.5.1",
      title: "Information Security Policies",
      category: "A.5",
      description:
        "A set of policies for information security shall be defined, approved by management, published and communicated to employees and relevant external parties.",
      dataSource: "policy",
    },
    {
      id: "A.5.2",
      title: "Information Security Roles and Responsibilities",
      category: "A.5",
      description:
        "All information security responsibilities shall be defined and allocated.",
      dataSource: "policy",
    },
    {
      id: "A.5.9",
      title: "Information Security in Supplier Relationships",
      category: "A.5",
      description:
        "Information security requirements shall be agreed with each supplier based on the type and quantity of information accessed, processed, stored or made available by the supplier.",
      dataSource: "policy",
    },
    {
      id: "A.5.12",
      title: "Information Security in Project Management",
      category: "A.5",
      description:
        "Information security shall be integrated into project management governance.",
      dataSource: "policy",
    },
    {
      id: "A.5.15",
      title: "Access Control",
      category: "A.5",
      description:
        "A topic-wide policy and baseline(s) for access control shall be defined, approved by management, published and communicated to employees and relevant external parties.",
      dataSource: "policy",
    },
    {
      id: "A.5.23",
      title: "Information Security for Use of Cloud Services",
      category: "A.5",
      description:
        "Processes for the acquisition, use, management and exit from cloud services shall be defined, incorporating information security requirements and supply chain considerations.",
      dataSource: "policy",
    },
    {
      id: "A.5.32",
      title: "Intellectual Property Rights",
      category: "A.5",
      description:
        "The organization shall implement appropriate procedures to ensure compliance with legislative, regulatory and contractual requirements related to intellectual property rights.",
      dataSource: "policy",
    },
    {
      id: "A.5.34",
      title: "Protection of Information Security Records",
      category: "A.5",
      description:
        "Information security records shall be protected from loss, modification, unauthorized access and release.",
      dataSource: "policy",
    },
    {
      id: "A.5.37",
      title: "Compliance with Policies and Standards for Information Security",
      category: "A.5",
      description:
        "Managers shall regularly review the compliance of information security procedures and rules within their area of responsibility.",
      dataSource: "policy",
    },
    // ── A.6 People Controls ────────────────────────────────────────────────────
    {
      id: "A.6.1",
      title: "Screening",
      category: "A.6",
      description:
        "Background verification checks on candidates for employment shall be carried out in accordance with relevant laws, regulations and ethics.",
      dataSource: "narrative",
    },
    {
      id: "A.6.3",
      title: "Information Security Awareness, Education and Training",
      category: "A.6",
      description:
        "Personnel of the organization shall receive information security awareness education and training and regular updates in information security policies and procedures.",
      dataSource: "narrative",
    },
    {
      id: "A.6.5",
      title: "Responsibilities After Termination or Change of Employment",
      category: "A.6",
      description:
        "Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, communicated to the individual and enforced.",
      dataSource: "narrative",
    },
    {
      id: "A.6.8",
      title: "Information Security Event Reporting",
      category: "A.6",
      description:
        "Personnel shall be required to report observed or suspected information security events through appropriate channels in a timely manner.",
      dataSource: "incident",
    },
    // ── A.8 Technological Controls ─────────────────────────────────────────────
    {
      id: "A.8.1",
      title: "User Endpoint Devices",
      category: "A.8",
      description:
        "Information stored, processed or accessible via or from user endpoint devices shall be protected in accordance with the requirements.",
      dataSource: "inventory",
    },
    {
      id: "A.8.2",
      title: "Privileged Access Rights",
      category: "A.8",
      description:
        "The allocation of privileged access rights shall be restricted and managed, taking into account the requirements for segregation of duties.",
      dataSource: "audit",
      query: { actionPrefix: "rbac." },
    },
    {
      id: "A.8.3",
      title: "Information Access Restriction",
      category: "A.8",
      description:
        "Access to information shall be restricted in accordance with the access control policy.",
      dataSource: "policy",
    },
    {
      id: "A.8.4",
      title: "Access to Source Code",
      category: "A.8",
      description:
        "Read and write access to source code shall be appropriately managed and restricted to prevent unauthorized changes.",
      dataSource: "narrative",
    },
    {
      id: "A.8.5",
      title: "Secure Authentication",
      category: "A.8",
      description:
        "Secure authentication technologies and procedures shall be implemented and managed to authenticate and authenticate to information and other system services.",
      dataSource: "narrative",
    },
    {
      id: "A.8.9",
      title: "Configuration Management",
      category: "A.8",
      description:
        "Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.8.10",
      title: "Information Deletion",
      category: "A.8",
      description:
        "Data storage media containing sensitive or confidential information shall be made unrecoverable when no longer required.",
      dataSource: "policy",
    },
    {
      id: "A.8.11",
      title: "Data Masking",
      category: "A.8",
      description:
        "Data masking shall be used in accordance with the organization access control policy and applicable regulations.",
      dataSource: "policy",
    },
    {
      id: "A.8.12",
      title: "Data Leakage Prevention",
      category: "A.8",
      description:
        "Data leakage prevention (DLP) controls shall be applied to networks, systems and end-user devices to detect and prevent unauthorized disclosure of information.",
      dataSource: "incident",
    },
    {
      id: "A.8.15",
      title: "Logging",
      category: "A.8",
      description:
        "Logs that record activities, exceptions, faults and security events shall be produced, stored, protected and retained to a defined retention period.",
      dataSource: "audit",
    },
    {
      id: "A.8.16",
      title: "Monitoring Activities",
      category: "A.8",
      description:
        "Networks, systems and applications shall be monitored for anomalous behaviour using automated tools.",
      dataSource: "incident",
    },
    {
      id: "A.8.18",
      title: "Networks Security",
      category: "A.8",
      description:
        "Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.8.20",
      title: "Security of Network Services",
      category: "A.8",
      description:
        "Security mechanisms, service levels and service requirements of network services shall be identified, implemented and monitored to ensure agreed levels of security.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.8.22",
      title: "Web Filtering",
      category: "A.8",
      description:
        "Remote access to organizational systems, applications and information shall be managed and controlled based on access control policies.",
      dataSource: "policy",
    },
    {
      id: "A.8.23",
      title: "Secure Coding",
      category: "A.8",
      description:
        "Principles for secure engineering shall be established and documented and applied during software development.",
      dataSource: "narrative",
    },
    {
      id: "A.8.24",
      title: "Cryptography",
      category: "A.8",
      description:
        "A policy on the use of cryptographic controls for protection of information shall be developed and implemented.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.8.25",
      title: "Secure Development Lifecycle",
      category: "A.8",
      description:
        "A software and system development lifecycle shall be established, documented, implemented and maintained.",
      dataSource: "narrative",
    },
    {
      id: "A.8.26",
      title: "Application Security Testing",
      category: "A.8",
      description:
        "Security testing shall be performed during development and implementation of applications.",
      dataSource: "evidence",
    },
    {
      id: "A.8.28",
      title: "Change Management",
      category: "A.8",
      description:
        "Changes to organizational, business processes, information processing facilities and systems that affect information security shall be managed using a formal change management process.",
      dataSource: "audit",
      query: { actionPrefix: "policy." },
    },
    {
      id: "A.8.29",
      title: "Security Testing in Development",
      category: "A.8",
      description:
        "Security testing should be part of the development lifecycle to identify vulnerabilities before deployment.",
      dataSource: "evidence",
    },
    {
      id: "A.8.34",
      title: "Protection of Information Transmitted by Networks",
      category: "A.8",
      description:
        "Information transmitted via networks shall be protected against interception, tampering, loss and unauthorized replay.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.8.38",
      title: "Business Critical Data",
      category: "A.8",
      description:
        "Business critical data shall be classified and managed in accordance with the data classification scheme.",
      dataSource: "data_lineage",
    },
    {
      id: "A.8.39",
      title: "Management of IT Usage Risk",
      category: "A.8",
      description:
        "Risks associated with the use of information system resources shall be identified and appropriate controls implemented.",
      dataSource: "risk",
    },
    {
      id: "A.8.41",
      title: "Security_baselines",
      category: "A.8",
      description:
        "The security capabilities and baseline security posture of information systems, applications and repositories shall be defined, documented and maintained.",
      dataSource: "policy",
    },
    {
      id: "A.8.42",
      title: "Segregation of Duties",
      category: "A.8",
      description:
        "Conflicting duties shall be segregated to reduce opportunities for unauthorized or unintentional modification or misuse of information assets.",
      dataSource: "audit",
      query: { actionPrefix: "rbac." },
    },
    {
      id: "A.8.43",
      title: "Security Incident Management",
      category: "A.8",
      description:
        "Management responsibilities and procedures shall be established to ensure effective response to security incidents.",
      dataSource: "incident",
    },
    {
      id: "A.8.44",
      title: "Information Leakage",
      category: "A.8",
      description:
        "Controls shall be implemented to prevent unauthorized disclosure of sensitive information through information leakage.",
      dataSource: "incident",
    },
  ],
};
