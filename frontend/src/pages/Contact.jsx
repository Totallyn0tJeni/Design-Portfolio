export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center fade-in">
      <h1 className="heading-font text-4xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Get In Touch</h1>
      <p className="mt-4 text-gray-600">
        Interested in collaborating or have questions about my work? Reach out below.
      </p>
      <div className="mt-10 space-y-4 text-lg">
        <p><a href="mailto:jeni.1245690@gmail.com" style={{ color: "rgb(124, 58, 237)" }} className="font-medium hover:underline">✉ jeni.1245690@gmail.com</a></p>
        <p><a href="https://linkedin.com/in/jenisha-patel18" target="_blank" rel="noreferrer" style={{ color: "rgb(124, 58, 237)" }} className="font-medium hover:underline">🔗 linkedin.com/in/jenisha-patel18</a></p>
        <p><a href="https://github.com/Totallyn0tJeni" target="_blank" rel="noreferrer" style={{ color: "rgb(124, 58, 237)" }} className="font-medium hover:underline">💻 github.com/Totallyn0tJeni</a></p>
      </div>
    </div>
  );
}
