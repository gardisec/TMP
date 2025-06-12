import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ user, onLogout }) => {
  return (
    <nav className="navbar">
      <div className="navbar-links">
        <Link to="/" className="nav-link">Срочные компоненты</Link>
        <Link to="/ships" className="nav-link">Список судов</Link>
        <Link to="/report" className="nav-link">Создать отчет</Link>
        <Link to="/subscribe" className="nav-link">Подписки</Link>
        
        {user && (
          <Link to="/profile" className="nav-link">
            Профиль ({user.username})
          </Link>
        )}
      </div>
      <button onClick={onLogout} className="nav-link logout-link">
        Выйти
      </button>
    </nav>
  );
};

export default Navbar;