import './globals.css';

export const metadata = {
    title: 'MIS & Actualisation Portal',
    description: 'Receivable + payable tracking for the accounts team',
};

export default function RootLayout({ children }) {
    return (
          <html lang="en">
            <body>{children}</body>
      </html>
    );
}
