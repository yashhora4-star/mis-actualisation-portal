'use client';

const NAV = [
  { key: 'sheet', label: 'Actualisation Sheet' },
  { key: 'upload', label: 'Upload sheets', superadminOnly: true },
  { key: 'team', label: 'Team access', superadminOnly: true },
  ];

export default function Sidebar({ active, onChange, role, pendingCount }) {
    return (
          <aside className="sidebar">
                <div className="sb-brand">
                        <div className="name">MIS PORTAL</div>div>
                        <div className="sub">Accounts tracking</div>div>
                </div>div>
                <nav className="nav">
                  {NAV.filter((n) => !n.superadminOnly || role === 'superadmin').map((item, i) => (
                      <div
                                    key={item.key}
                                    className={`nav-item ${active === item.key ? 'active' : ''}`}
                                    onClick={() => onChange(item.key)}
                                  >
                                  <span className="num">{String(i + 1).padStart(2, '0')}</span>span>
                                  <span>{item.label}</span>span>
                        {item.key === 'sheet' && pendingCount > 0 && (
                                                  <span className="badge">{pendingCount}</span>span>
                                  )}
                      </div>div>
                    ))}
                </nav>nav>
                <div className="sb-footer">
                        Signed in as
                        <div className="role-pill">{role === 'superadmin' ? 'Superadmin' : 'Team member'}</div>div>
                </div>div>
          </aside>aside>
        );
}
</aside>
