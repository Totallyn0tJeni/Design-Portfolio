import { LogIn } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const signIn = () => {
    const redirectUrl = window.location.origin + "/admin";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "rgb(250, 250, 250)" }}>
      <div className="bg-white border border-gray-100 rounded-3xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-5" style={{ background: "rgb(245, 243, 255)" }}>
          <LogIn className="w-5 h-5" style={{ color: "rgb(124, 58, 237)" }} />
        </div>
        <h1 className="heading-font text-2xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Admin Sign in</h1>
        <p className="mt-3 text-sm text-gray-500">
          Restricted to allowlisted Google accounts. Contact the portfolio owner for access.
        </p>
        <button onClick={signIn} data-testid="google-signin-btn"
                className="mt-6 w-full px-5 py-3 rounded-full text-white font-medium"
                style={{ background: "rgb(124, 58, 237)" }}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
