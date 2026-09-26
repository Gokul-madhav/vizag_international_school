// Mirror of the backend payloads so the dashboards still render when the API
// is unreachable. Keep in sync with backend/app/data.py if you change shapes.

export const FALLBACK_ADMIN = {
  school: "Vizag International School",
  user: { name: "Principal's Office", avatar: "VIS", role: "Administrator" },
  kpis: [
    { label: "Total Students", value: "2,568", changePct: 3.4, trendUp: true },
    { label: "Teaching Staff", value: "148", changePct: 1.2, trendUp: true },
    { label: "Avg. Attendance", value: "93.6%", changePct: 0.8, trendUp: true },
    { label: "Fee Due", value: "₹4.2L", changePct: 5.1, trendUp: false },
  ],
  feeCollection: {
    title: "Fee Collection",
    total: 7852000,
    currency: "₹",
    changePct: 2.1,
    trendUp: true,
    caption: "Collected from 1-12 Sep, 2026",
    legend: { current: "This month", previous: "Last month" },
    series: [
      { day: "01", current: 62, previous: 40 },
      { day: "02", current: 48, previous: 70 },
      { day: "03", current: 57, previous: 44 },
      { day: "04", current: 40, previous: 66 },
      { day: "05", current: 82, previous: 30 },
      { day: "06", current: 92, previous: 26 },
      { day: "07", current: 66, previous: 40 },
      { day: "08", current: 44, previous: 62 },
      { day: "09", current: 60, previous: 30 },
      { day: "10", current: 34, previous: 52 },
      { day: "11", current: 78, previous: 46 },
      { day: "12", current: 88, previous: 40 },
    ],
  },
  sectionSplit: {
    title: "Enrolment by Section",
    range: "As on 6 Sep, 2026",
    highlight: { label: "Primary (I-V)", sub: "Grades I to V", count: 1027 },
    segments: [
      { label: "Primary (I-V)", value: 40, color: "#5b5bd6" },
      { label: "Middle (VI-VIII)", value: 32, color: "#8f8ff0" },
      { label: "Secondary (IX-XII)", value: 28, color: "#c9c9f7" },
    ],
  },
  performance: {
    title: "School Performance Index",
    subtitle: "Rolling 90-day quality score across key areas",
    metrics: [
      { label: "Academics", value: 85, color: "#f2a63b" },
      { label: "Attendance", value: 92, color: "#33c5c5" },
      { label: "Discipline", value: 85, color: "#7c6cf0" },
    ],
  },
  topClasses: {
    title: "Top Performing Classes",
    subtitle: "By average assessment score this term",
    items: [
      { name: "Grade X - A", meta: "Class teacher: R. Menon", value: "94.2%" },
      { name: "Grade IX - B", meta: "Class teacher: S. Rao", value: "91.8%" },
      { name: "Grade VIII - A", meta: "Class teacher: P. Nair", value: "90.5%" },
      { name: "Grade XII - C", meta: "Class teacher: A. Khan", value: "89.1%" },
    ],
  },
  admissions: {
    title: "New Admissions",
    total: 312,
    changePct: 2.1,
    trendUp: false,
    caption: "Applications from 1-6 Sep, 2026",
    labels: ["01", "02", "03", "04", "05", "06"],
    legend: { current: "This week", previous: "Last week" },
    current: [22, 30, 26, 41, 24, 52],
    previous: [30, 44, 38, 40, 34, 36],
  },
  notifications: [
    { title: "Board exam datesheet released", time: "10 min ago" },
    { title: "3 fee reminders auto-sent to parents", time: "1 hr ago" },
    { title: "Science fair registrations closing today", time: "3 hr ago" },
  ],
};

export const FALLBACK_STUDENT = {
  student: {
    name: "Ananya Sharma",
    class: "Grade IX - B",
    roll: "IX-B-14",
    avatar: "AS",
    section: "Middle School",
  },
  stats: [
    { label: "Attendance", value: "94%", changePct: 1.5, trendUp: true },
    { label: "Overall GPA", value: "8.7", changePct: 0.3, trendUp: true },
    { label: "Class Rank", value: "3 / 42", changePct: 2.0, trendUp: true },
    { label: "Pending Tasks", value: "5", changePct: 1.0, trendUp: false },
  ],
  subjectMarks: {
    title: "Subject Performance",
    caption: "Term 2 vs Term 1 scores (out of 100)",
    legend: { current: "Term 2", previous: "Term 1" },
    series: [
      { day: "Math", current: 88, previous: 82 },
      { day: "Sci", current: 91, previous: 79 },
      { day: "Eng", current: 84, previous: 80 },
      { day: "Hist", current: 76, previous: 72 },
      { day: "Geo", current: 82, previous: 85 },
      { day: "Hindi", current: 79, previous: 74 },
      { day: "CS", current: 95, previous: 88 },
    ],
  },
  attendanceTrend: {
    title: "Attendance Trend",
    caption: "Weekly attendance for the last 6 weeks",
    labels: ["W1", "W2", "W3", "W4", "W5", "W6"],
    legend: { current: "This term", previous: "Class average" },
    current: [92, 88, 95, 97, 90, 96],
    previous: [90, 91, 89, 92, 90, 91],
  },
  studySplit: {
    title: "Study Time Split",
    range: "Average weekday, self-reported",
    highlight: { label: "STEM subjects", sub: "Math + Science + CS", count: 9 },
    segments: [
      { label: "STEM subjects", value: 45, color: "#5b5bd6" },
      { label: "Languages", value: 30, color: "#8f8ff0" },
      { label: "Humanities", value: 25, color: "#c9c9f7" },
    ],
  },
  skillIndex: {
    title: "Skill Index",
    subtitle: "Teacher-assessed competencies this term",
    metrics: [
      { label: "Problem Solving", value: 88, color: "#f2a63b" },
      { label: "Communication", value: 82, color: "#33c5c5" },
      { label: "Teamwork", value: 90, color: "#7c6cf0" },
    ],
  },
  upcomingExams: {
    title: "Upcoming Exams",
    subtitle: "Next 10 days",
    items: [
      { name: "Physics - Unit Test 3", meta: "Chapters 6-8", value: "15 Sep" },
      { name: "English - Literature", meta: "Poetry + Prose", value: "17 Sep" },
      { name: "Mathematics - Term 2", meta: "Full syllabus", value: "22 Sep" },
      { name: "Computer Science", meta: "Practical + Viva", value: "24 Sep" },
    ],
  },
  assignments: [
    { title: "Algebra Worksheet 4", subject: "Mathematics", due: "12 Sep", status: "Pending" },
    { title: "Photosynthesis Lab Report", subject: "Science", due: "13 Sep", status: "Pending" },
    { title: "Essay: My Favourite Book", subject: "English", due: "14 Sep", status: "In Review" },
    { title: "Map Work - Rivers of India", subject: "Geography", due: "16 Sep", status: "Pending" },
    { title: "Python Turtle Project", subject: "Computer Science", due: "18 Sep", status: "Submitted" },
  ],
  timetable: [
    { time: "08:00", subject: "English", room: "Room 204" },
    { time: "09:00", subject: "Mathematics", room: "Room 118" },
    { time: "10:15", subject: "Science", room: "Lab 2" },
    { time: "11:15", subject: "History", room: "Room 207" },
    { time: "12:30", subject: "Computer Science", room: "Lab 4" },
    { time: "13:30", subject: "Physical Education", room: "Ground" },
  ],
};
