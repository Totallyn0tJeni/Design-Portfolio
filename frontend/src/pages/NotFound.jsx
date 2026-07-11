import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-6 py-24 text-center">
      <p className="text-sm font-medium mb-2" style={{ color: "rgb(124, 58, 237)" }}>404</p>
      <h1 className="heading-font text-4xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Page not found</h1>
      <p className="text-gray-500 mt-3">The page you're looking for doesn't exist.</p>
      <Link to="/" className="inline-block mt-8 px-5 py-2.5 rounded-full text-white font-medium" style={{ background: "rgb(124, 58, 237)" }}>Go home</Link>
    </div>
  );
}
