import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { fetchAcademicsTree } from "./api.js";
import { useSettings } from "./settings.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";
import TakeAssignment from "./pages/TakeAssignment.jsx";
import Academics from "./pages/Academics.jsx";
import AssignmentEditor from "./pages/AssignmentEditor.jsx";
import Students from "./pages/Students.jsx";
import Examinations from "./pages/Examinations.jsx";
import Tests from "./pages/Tests.jsx";
import NewStudents from "./pages/NewStudents.jsx";
import Settings from "./pages/Settings.jsx";
import FeatureDisabled from "./pages/FeatureDisabled.jsx";
import UnderConstruction from "./pages/UnderConstruction.jsx";

// Renders children unless a feature flag has switched the feature off.
function Gated({ flag, children }) {
  const { flags, loaded } = useSettings();
  if (loaded && flag && !flags[flag]) return <FeatureDisabled flag={flag} />;
  return children;
}

const adminRoute = (element) => <Layout role="admin">{element}</Layout>;

export default function App() {
  // Warm the academics-tree cache so admin pages don't stall on first open.
  useEffect(() => {
    fetchAcademicsTree();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/student" replace />} />

      {/* Admin */}
      <Route path="/admin" element={adminRoute(<AdminDashboard />)} />
      <Route
        path="/admin/academics"
        element={adminRoute(
          <Gated flag="academics">
            <Academics />
          </Gated>
        )}
      />
      <Route
        path="/admin/academics/a/:assignmentId"
        element={adminRoute(
          <Gated flag="assignments">
            <AssignmentEditor />
          </Gated>
        )}
      />
      <Route
        path="/admin/students"
        element={adminRoute(
          <Gated flag="students">
            <Students />
          </Gated>
        )}
      />
      <Route path="/admin/examinations" element={adminRoute(<Examinations />)} />
      <Route path="/admin/tests" element={adminRoute(<Tests />)} />
      <Route path="/admin/new-students" element={adminRoute(<NewStudents />)} />
      <Route path="/admin/settings" element={adminRoute(<Settings />)} />
      <Route
        path="/admin/:section"
        element={adminRoute(
          <Gated flag="under_construction">
            <UnderConstruction />
          </Gated>
        )}
      />

      {/* Student */}
      <Route
        path="/student"
        element={
          <Layout role="student">
            <Gated flag="student_portal">
              <StudentDashboard />
            </Gated>
          </Layout>
        }
      />
      <Route
        path="/student/a/:assignmentId"
        element={
          <Layout role="student">
            <Gated flag="student_portal">
              <TakeAssignment />
            </Gated>
          </Layout>
        }
      />
      <Route
        path="/student/:section"
        element={
          <Layout role="student">
            <Gated flag="under_construction">
              <UnderConstruction />
            </Gated>
          </Layout>
        }
      />

      <Route path="*" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}
