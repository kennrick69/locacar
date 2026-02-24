import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
});

// Interceptor - adiciona token em todas as requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('locacar_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor - trata 401 (token expirado)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('locacar_token');
      localStorage.removeItem('locacar_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ========== AUTH ==========
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  tokenLogin: (token) => api.post('/auth/token-login', { token }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// ========== CARS ==========
export const carsAPI = {
  list: () => api.get('/cars'),
  listAll: () => api.get('/cars/all'),
  get: (id) => api.get(`/cars/${id}`),
  create: (formData) => api.post('/cars', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, formData) => api.put(`/cars/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/cars/${id}`),
};

// ========== SETTINGS ==========
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  getFees: () => api.get('/settings/installment-fees'),
  updateFees: (data) => api.put('/settings/installment-fees', data),
};

// ========== DRIVERS ==========
export const driversAPI = {
  // Motorista logado
  me: () => api.get('/drivers/me'),
  myDocuments: () => api.get('/drivers/me/documents'),
  uploadDocument: (tipo, formData) => api.post(`/drivers/me/documents?tipo=${tipo}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadContrato: (formData) => api.post('/drivers/me/contrato', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  myCharges: () => api.get('/drivers/me/charges'),
  currentCharge: () => api.get('/drivers/me/charges/current'),
  chargeDetail: (id) => api.get(`/drivers/me/charges/${id}`),
  myBalance: () => api.get('/drivers/me/balance'),
  myPayments: () => api.get('/drivers/me/payments'),
  submitAbatimento: (chargeId, formData) => api.post(`/drivers/me/charges/${chargeId}/abatimentos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Admin
  list: (status) => api.get('/drivers', { params: { status } }),
  get: (id) => api.get(`/drivers/${id}`),
  adminCreate: (data) => api.post('/drivers/admin-create', data),
  adminUploadDoc: (driverId, tipo, formData) => api.post(`/drivers/${driverId}/documents?tipo=${tipo}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  approve: (id, data) => api.patch(`/drivers/${id}/approve`, data),
  reject: (id, data) => api.patch(`/drivers/${id}/reject`, data),
  activate: (id) => api.patch(`/drivers/${id}/activate`),
  confirmContract: (id) => api.patch(`/drivers/${id}/confirm-contract`),
  createCharge: (driverId, data) => api.post(`/drivers/${driverId}/charges`, data),
  approveAbatimento: (driverId, abatId) => api.patch(`/drivers/${driverId}/abatimentos/${abatId}/approve`),
  addAcrescimo: (driverId, data) => api.post(`/drivers/${driverId}/acrescimos`, data),
  removeAcrescimo: (driverId, acrescimoId) => api.delete(`/drivers/${driverId}/acrescimos/${acrescimoId}`),
  settlement: (driverId, data) => api.post(`/drivers/${driverId}/settlement`, data),
};

// ========== PAYMENTS ==========
export const paymentsAPI = {
  simulate: (valor) => api.post('/payments/simulate', { valor }),
  payCaucao: (data) => api.post('/payments/caucao', data),
  payWeekly: (chargeId, data) => api.post(`/payments/weekly/${chargeId}`, data),
  confirm: (id) => api.post(`/payments/${id}/confirm`),
  installmentOptions: () => api.get('/payments/installment-options'),
};
