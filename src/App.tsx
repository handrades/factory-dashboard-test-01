import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { FactoryProvider } from './context/FactoryContext';
import Dashboard from './pages/Dashboard';
import LineDetail from './pages/LineDetail';
import './App.css';

function App() {
  return (
    <FactoryProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/line/:id" element={<LineDetail />} />
          </Routes>
        </div>
      </Router>
    </FactoryProvider>
  );
}

export default App
