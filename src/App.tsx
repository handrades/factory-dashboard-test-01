import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { FactoryProvider } from './context';
import { AuthProvider } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import LineDetail from './pages/LineDetail';
import './App.css';

function App() {
  // Use root path for Docker, GitHub Pages path for production
  const basename = import.meta.env.BASE_URL;
  
  return (
    <AuthProvider>
      <FactoryProvider>
        <Router basename={basename}>
          <div className="App">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/line/:id" element={<LineDetail />} />
            </Routes>
          </div>
        </Router>
      </FactoryProvider>
    </AuthProvider>
  );
}

export default App
