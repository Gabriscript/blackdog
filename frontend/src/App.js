import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import LandingPage from "./pages/LandingPage";
import BookingPage from "./pages/BookingPage";
import BookingSuccess from "./pages/BookingSuccess";
import MyBooking from "./pages/MyBooking";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <div className="App">
      <Toaster theme="dark" position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/prenota" element={<BookingPage />} />
          <Route path="/prenota/successo" element={<BookingSuccess />} />
          <Route path="/mia-prenotazione/:token" element={<MyBooking />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/forgot-password" element={<ForgotPassword />} />
          <Route path="/admin/reset-password"  element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
