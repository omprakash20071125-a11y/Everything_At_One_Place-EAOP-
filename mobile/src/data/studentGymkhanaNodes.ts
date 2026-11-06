export const STUDENT_GYMKHANA_CHART = {
  width: 5400,
  height: 1840,
} as const;

export type StudentGymkhanaNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
};

// These hit areas and relationships correspond to the nodes in the supplied SVG.
export const STUDENT_GYMKHANA_NODES: StudentGymkhanaNode[] = [
  { id: "student-gymkhana", label: "Student Gymkhana", x: 520, y: 170, width: 280, height: 100, parentId: null },
  { id: "president", label: "President Student Gymkhana", x: 520, y: 370, width: 280, height: 130, parentId: "student-gymkhana" },
  { id: "vice-president", label: "Vice President (Ex-officio Chair of the Student Senate)", x: 520, y: 570, width: 280, height: 140, parentId: "president" },
  { id: "student-senate", label: "Student Senate", x: 520, y: 790, width: 280, height: 100, parentId: "vice-president" },
  { id: "constitutional-bodies", label: "Constitutional Bodies", x: 1880, y: 190, width: 330, height: 100, parentId: "student-gymkhana" },
  { id: "election-commission", label: "Election Commission", x: 1730, y: 405, width: 300, height: 95, parentId: "constitutional-bodies" },
  { id: "media-cell", label: "Media Cell", x: 2175, y: 405, width: 250, height: 95, parentId: "constitutional-bodies" },
  { id: "institute-committees", label: "Member of various Institute Committees", x: 900, y: 390, width: 330, height: 90, parentId: "president" },
  { id: "act-council", label: "General Secretary Academic, Career and Technology (ACT) Council", x: 360, y: 1100, width: 480, height: 125, parentId: "student-senate" },
  { id: "aire-council", label: "General Secretary Alumni, IR & Entrepreneurship (AIRE)", x: 1410, y: 1100, width: 480, height: 125, parentId: "student-senate" },
  { id: "sports-council", label: "General Secretary Sports Council", x: 2205, y: 1100, width: 390, height: 125, parentId: "student-senate" },
  { id: "cultural-literary-council", label: "General Secretary Cultural & Literary Council", x: 2950, y: 1100, width: 500, height: 125, parentId: "student-senate" },
  { id: "hmc-heads", label: "HMC Overall Heads (1 UG + 1 PG) (incl. 1 Male & 1 Female)", x: 3840, y: 1100, width: 420, height: 125, parentId: "student-senate" },
  { id: "swc-heads", label: "SWC Overall Heads (1 UG + 1 PG)", x: 4350, y: 1100, width: 400, height: 125, parentId: "student-senate" },
  { id: "dining-heads", label: "Dining Committee Overall Heads (1 UG + 1 PG)", x: 4830, y: 1100, width: 440, height: 125, parentId: "student-senate" },
  { id: "all-technical-societies", label: "All Technical Societies", x: 27.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "sandstone-summit", label: "Sandstone Summit", x: 194.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "tinkering-lab", label: "Tinkering Lab", x: 361.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "prometeo", label: "Prometeo", x: 528.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "career-development-cell", label: "Career Development Cell", x: 695.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "inter-iit-tech-meet", label: "Inter-IIT Tech Meet", x: 862.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "academic-representatives", label: "Academic Representatives SUGC / SPGC / SDEC / SRB / CRs", x: 1029.5, y: 1395, width: 145, height: 120, parentId: "act-council" },
  { id: "e-cell", label: "E-Cell", x: 1235, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "tisc-student-team", label: "TISC Student Team", x: 1375, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "tedx", label: "TEDx", x: 1515, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "society-alumni-affairs", label: "Society of Alumni Affairs", x: 1655, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "convocation-student-team", label: "Convocation Student Team", x: 1795, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "ir-team", label: "IR Team", x: 1935, y: 1395, width: 130, height: 120, parentId: "aire-council" },
  { id: "varchas", label: "Varchas", x: 2135, y: 1395, width: 170, height: 120, parentId: "sports-council" },
  { id: "all-sports-societies", label: "All Sports Societies", x: 2315, y: 1395, width: 170, height: 120, parentId: "sports-council" },
  { id: "inter-iit-sports", label: "Inter-IIT Sports", x: 2495, y: 1395, width: 170, height: 120, parentId: "sports-council" },
  { id: "all-cultural-societies", label: "All Cultural Societies", x: 2722.5, y: 1395, width: 155, height: 120, parentId: "cultural-literary-council" },
  { id: "inter-iit-cultural-meet", label: "Inter-IIT Cultural Meet", x: 2897.5, y: 1395, width: 155, height: 120, parentId: "cultural-literary-council" },
  { id: "all-literary-societies", label: "All Literary Societies", x: 3072.5, y: 1395, width: 155, height: 120, parentId: "cultural-literary-council" },
  { id: "ignus", label: "Ignus", x: 3247.5, y: 1395, width: 155, height: 120, parentId: "cultural-literary-council" },
  { id: "community-festival-committee", label: "Community Festival Committee", x: 3422.5, y: 1395, width: 155, height: 120, parentId: "cultural-literary-council" },
  { id: "hostel-secretaries", label: "Hostel Secretaries", x: 3905, y: 1395, width: 290, height: 120, parentId: "hmc-heads" },
  { id: "swc-arts", label: "SWC Arts", x: 4410, y: 1395, width: 280, height: 120, parentId: "swc-heads" },
  { id: "student-guides", label: "Student Guides", x: 4410, y: 1610, width: 280, height: 110, parentId: "swc-arts" },
  { id: "dining-secretaries", label: "Dining Secretaries", x: 4900, y: 1395, width: 300, height: 120, parentId: "dining-heads" },
  { id: "joint-secretaries-dining", label: "Joint Secretaries, Dining", x: 4900, y: 1610, width: 300, height: 110, parentId: "dining-secretaries" },
];
