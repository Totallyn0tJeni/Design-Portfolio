import React, { useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import Layout from "./components/portfolio/Layout";
import Home from "./pages/Home";
import Gallery from "./pages/Gallery";
import ProjectDetail from "./pages/ProjectDetail";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Handle Emergent OAuth callback (session_id in URL fragment)
  useEffect(() => {
    if (location.hash?.includes("session_id=")) {
      navigate("/auth/callback" + location.hash, { replace: true });
    }
  }, [location, navigate]);

  return (
    <div className="App">
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/organization/:name" element={<Gallery mode="organization" />} />
          <Route path="/category/:name" element={<Gallery mode="category" />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
