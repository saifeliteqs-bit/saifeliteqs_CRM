import './globals.css';

export const metadata = {
  title: 'Saif Elite QS — CRM',
  description: 'Quantity Surveyor & Cost Consultant — Client Management System',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
