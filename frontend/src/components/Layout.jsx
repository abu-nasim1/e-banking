import {
  LayoutDashboard,
  WalletCards,
  ArrowLeftRight,
  History,
  CreditCard,
  Users,
  LogOut,
  Landmark,
  HandCoins,
  Menu,
  X,
  Trash2,
} from 'lucide-react';

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    nav('/login');
  };

  const handleCloseAccount = async () => {
    const confirmed = window.confirm('Close your customer login? Your access will stop, but the bank will retain your account and transaction records.');
    if (!confirmed) return;
    try {
      await api.delete('/auth/me');
      logout();
      nav('/login', { replace: true });
    } catch (error) {
      window.alert(error.response?.data?.message || 'Could not close your account. Please contact the bank.');
    }
  };

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      to: '/accounts',
      label: 'My Accounts',
      icon: WalletCards,
    },
    {
      to: '/transfer',
      label: 'Transfer Money',
      icon: ArrowLeftRight,
    },
    {
      to: '/loans',
      label: 'Loans',
      icon: HandCoins,
    },
    {
      to: '/transactions',
      label: 'Transactions',
      icon: History,
    },
    {
      to: '/cards',
      label: 'My Cards',
      icon: CreditCard,
    },
    {
      to: '/beneficiaries',
      label: 'Beneficiaries',
      icon: Users,
    },
  ];

  const firstLetter =
    user?.name?.charAt(0)?.toUpperCase() || 'U';
  const pageTitle = navItems.find((item) => item.to === location.pathname)?.label || 'E-Bank';

  return (
    <div className={`shell${menuOpen ? ' menu-open' : ''}`}>
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setMenuOpen(false)}
      />
      {/* SIDEBAR */}
      <aside className="sidebar premium-sidebar">

        {/* LOGO */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Landmark size={24} />
          </div>

          <div>
            <h2>AN Bank</h2>
            <span>Digital Banking</span>
          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="sidebar-nav">
          <span className="sidebar-nav-title">
            MAIN MENU
          </span>

          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'sidebar-link active'
                    : 'sidebar-link'
                }
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} />

                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* USER / LOGOUT */}
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {firstLetter}
            </div>

            <div className="sidebar-user-info">
              <strong>
                {user?.name || 'User'}
              </strong>

              <span>
                {user?.email || ''}
              </span>
            </div>
          </div>

          <button className="sidebar-close-account" onClick={handleCloseAccount}>
            <Trash2 size={16} />
            <span>Close my account</span>
          </button>

          <button
            className="sidebar-logout"
            onClick={handleLogout}
          >
            <LogOut size={18} />

            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main premium-main">

        {/* TOP HEADER */}
        <header className="top-header">

          <div className="top-header-left">
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div className="mobile-title">
              <span>E-Bank workspace</span>
              <h2>{pageTitle}</h2>
            </div>
          </div>

          <div className="top-header-right">
            {/* USER */}
            <div className="header-user">
              <div className="header-avatar">
                {firstLetter}
              </div>

              <div className="header-user-text">
                <strong>
                  {user?.name || 'User'}
                </strong>

                <span>
                  {user?.email || ''}
                </span>
              </div>
            </div>

          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}