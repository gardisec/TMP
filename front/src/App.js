import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import * as api from './services/api';

import './App.css'; 

import Navbar from './components/Navbar';
import Login from './components/Login';
import Register from './components/Register';
import UserProfile from './components/UserProfile';
import ShipList from './components/ShipList';
import ComponentList from './components/ComponentList';
import ComponentDetail from './components/ComponentDetail';
import ReportForm from './components/ReportForm';
import SubscriptionForm from './components/SubscriptionForm';
import ExpiringComponents from './components/ExpiringComponents';
import ProtectedRoute from './components/ProtectedRoute';
import AddShip from './components/AddShip';
import AddComponent from './components/AddComponent';

const AppContent = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        const promise = api.logout();

        toast.promise(promise, {
            loading: 'Выход из системы...',
            success: 'Вы успешно вышли!',
            error: (err) => err.message || 'Не удалось выйти.',
        });

        try {
            await promise;
        } catch (error) {
            console.error("Ошибка при выходе из системы:", error);
        } finally {
            setUser(null);
            navigate('/login');
        }
    };
    useEffect(() => {
        const checkUserSession = async () => {
            try {
                const userData = await api.getCurrentUser();
                if (userData && userData.user_id) {
                    setUser({ id: userData.user_id, ...userData });
                }
            } catch (error) {
            } finally {
                setLoading(false);
            }
        };

        checkUserSession();
        
        const handleForceLogout = () => {
            console.log('Получено событие принудительного выхода. Обновление состояния.');
            setUser(null);
            navigate('/login', { replace: true });
        };
        
        window.addEventListener('logout-event', handleForceLogout);

        return () => {
            window.removeEventListener('logout-event', handleForceLogout);
        };

    }, [navigate]);

    const handleLoginSuccess = async (authData) => {
        if (authData.success) {
            const userData = await api.getCurrentUser();
            setUser({ id: userData.user_id, ...userData });

            const from = location.state?.from?.pathname || '/';
            navigate(from, { replace: true });
        }
    };

    if (loading) {
        return <div>Загрузка приложения...</div>;
    }

    return (
        <>
            {user && <Navbar user={user} onLogout={handleLogout} />}
            <main className="container">
                <Routes>
                    <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
                    <Route path="/register" element={<Register onRegisterSuccess={handleLoginSuccess} />} />
                    <Route path="/" element={<ProtectedRoute user={user}><ExpiringComponents /></ProtectedRoute>} />
                    <Route path="/ships" element={<ProtectedRoute user={user}><ShipList /></ProtectedRoute>} />
                    <Route path="/add-ship" element={<ProtectedRoute user={user}><AddShip /></ProtectedRoute>} />
                    <Route path="/ships/:shipId/components" element={<ProtectedRoute user={user}><ComponentList /></ProtectedRoute>} />
                    <Route path="/ships/:shipId/add-component" element={<ProtectedRoute user={user}><AddComponent /></ProtectedRoute>} />
                    <Route path="/components/:componentId" element={<ProtectedRoute user={user}><ComponentDetail /></ProtectedRoute>} />
                    <Route path="/report" element={<ProtectedRoute user={user}><ReportForm /></ProtectedRoute>} />
                    <Route path="/subscribe" element={<ProtectedRoute user={user}><SubscriptionForm user={user} /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute user={user}><UserProfile user={user} setUser={setUser} /></ProtectedRoute>} />
                    
                    <Route path="*" element={<div style={{ textAlign: 'center', marginTop: '50px' }}><h2>404 - Страница не найдена</h2></div>} />
                </Routes>
            </main>
        </>
    );
};

function App() {
    return (
        <Router>
            <Toaster
                position="top-center"
                reverseOrder={false}
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#333',
                        color: '#fff',
                        fontSize: '16px',
                        padding: '12px 20px',
                    },
                    success: {
                        style: { background: '#28a745' },
                    },
                    error: {
                        style: { background: '#dc3545' },
                    },
                }}
            />
            <AppContent />
        </Router>
    );
}

export default App;