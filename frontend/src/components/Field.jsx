// Labelled form field wrapper — shared by BookingPage and AdminDashboard.
export default function Field({ label, children }) {
  return (
    <label className="block">
      <span className="font-mono-tech text-[#A1A1AA] block mb-2">{label}</span>
      {children}
    </label>
  );
}
