import { createContext, useContext, useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { api, getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('timepay_employee');
    if (stored && getToken()) {
      setEmployee(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.token);
    localStorage.setItem('timepay_employee', JSON.stringify(data.employee));
    setEmployee(data.employee);
    return data.employee;
  }

  function logout() {
    setToken(null);
    localStorage.removeItem('timepay_employee');
    setEmployee(null);
  }

  // Usernameless passkey login: the browser/OS shows whichever passkeys it
  // has stored for this site and prompts Face ID / fingerprint / Windows
  // Hello. Falls back to password login if the user cancels or has none.
  async function loginWithPasskey() {
    const { token, options } = await api.post('/auth/webauthn/login-options');
    const response = await startAuthentication({ optionsJSON: options });
    const data = await api.post('/auth/webauthn/login-verify', { token, response });
    setToken(data.token);
    localStorage.setItem('timepay_employee', JSON.stringify(data.employee));
    setEmployee(data.employee);
    return data.employee;
  }

  return (
    <AuthContext.Provider
      value={{
        employee,
        login,
        loginWithPasskey,
        logout,
        loading,
        isManager: employee && ['ADMIN', 'MANAGER'].includes(employee.systemRole),
        isAdmin: employee?.systemRole === 'ADMIN',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
