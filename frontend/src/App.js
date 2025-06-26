import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Zustand store for global state
const useStore = create((set, get) => ({
  isDetecting: false,
  settings: {
    confidence: 0.5,
    resolution: '640x480',
    theme: 'space'
  },
  detections: [],
  diagnostics: [],
  equipment: [
    { id: 1, name: 'Fire Extinguisher', class: 0, criticality: 'High', description: 'Emergency fire suppression system', status: 'operational' },
    { id: 2, name: 'Tool Box', class: 1, criticality: 'Medium', description: 'Maintenance and repair equipment', status: 'operational' },
    { id: 3, name: 'Oxygen Tank', class: 2, criticality: 'Critical', description: 'Life support oxygen supply', status: 'maintenance' }
  ],
  
  setDetecting: (status) => set({ isDetecting: status }),
  updateSettings: (newSettings) => set(state => ({ settings: { ...state.settings, ...newSettings } })),
  addDetection: (detection) => set(state => ({ 
    detections: [detection, ...state.detections.slice(0, 49)],
    diagnostics: [{
      id: Date.now(),
      timestamp: new Date().toISOString(),
      event: `Detected ${detection.name}`,
      confidence: detection.conf,
      status: 'detected'
    }, ...state.diagnostics.slice(0, 19)]
  })),
  clearDetections: () => set({ detections: [], diagnostics: [] })
}));

// Detection Console Component
const DetectionConsole = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const { isDetecting, settings, detections, setDetecting, addDetection } = useStore();

  const classNames = ['FireExtinguisher', 'ToolBox', 'OxygenTank'];
  const colors = ['#2EFFFF', '#FF9F2E', '#FF4747'];

  const startDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // WebSocket connection
      const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/detect';
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setDetecting(true);
        sendFrames();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const detections = JSON.parse(event.data);
          drawDetections(detections);
          
          // Add to store
          detections.forEach(det => {
            if (det.conf > settings.confidence) {
              addDetection({
                ...det,
                name: classNames[det.cls] || 'Unknown',
                timestamp: new Date().toISOString()
              });
            }
          });
        } catch (error) {
          console.error('Error parsing detection data:', error);
        }
      };

    } catch (error) {
      console.error('Error starting detection:', error);
    }
  }, [settings.confidence, setDetecting, addDetection]);

  const sendFrames = useCallback(() => {
    if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const base64Frame = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    wsRef.current.send(base64Frame);
    
    if (isDetecting) {
      setTimeout(sendFrames, 100); // ~10 FPS to avoid overwhelming
    }
  }, [isDetecting]);

  const drawDetections = useCallback((detections) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    detections.forEach(det => {
      if (det.conf > settings.confidence) {
        const color = colors[det.cls] || '#2EFFFF';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = color + '20';
        
        const width = det.x2 - det.x1;
        const height = det.y2 - det.y1;
        
        ctx.fillRect(det.x1, det.y1, width, height);
        ctx.strokeRect(det.x1, det.y1, width, height);
        
        // Label
        ctx.fillStyle = color;
        ctx.font = '12px monospace';
        const label = `${classNames[det.cls]} ${(det.conf * 100).toFixed(1)}%`;
        ctx.fillText(label, det.x1, det.y1 - 5);
      }
    });
  }, [settings.confidence]);

  const stopDetection = useCallback(() => {
    setDetecting(false);
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  }, [setDetecting]);

  return (
    <div className="detection-console">
      <div className="viewport-container">
        <video ref={videoRef} className="video-feed" width="640" height="480" />
        <canvas ref={canvasRef} className="detection-overlay" width="640" height="480" />
        <div className="controls">
          {!isDetecting ? (
            <button onClick={startDetection} className="start-btn">
              Start Detection
            </button>
          ) : (
            <button onClick={stopDetection} className="stop-btn">
              Stop Detection
            </button>
          )}
        </div>
      </div>
      
      <div className="detection-sidebar">
        <h3>Live Detections</h3>
        <div className="detection-list">
          {detections.slice(0, 10).map((det, idx) => (
            <motion.div
              key={`${det.timestamp}-${idx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="detection-item"
            >
              <div className="detection-icon" style={{ backgroundColor: colors[det.cls] }}></div>
              <div className="detection-info">
                <span className="detection-name">{det.name}</span>
                <span className="detection-confidence">{(det.conf * 100).toFixed(1)}%</span>
                <span className="detection-time">{new Date(det.timestamp).toLocaleTimeString()}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Settings Modal Component  
const SettingsModal = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="modal-content"
            onClick={e => e.stopPropagation()}
          >
            <h2>Detection Settings</h2>
            <div className="setting-group">
              <label>Confidence Threshold: {(settings.confidence * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={settings.confidence}
                onChange={e => updateSettings({ confidence: parseFloat(e.target.value) })}
                className="slider"
              />
            </div>
            <div className="setting-group">
              <label>Resolution</label>
              <select
                value={settings.resolution}
                onChange={e => updateSettings({ resolution: e.target.value })}
                className="select"
              >
                <option value="640x480">640x480</option>
                <option value="1280x720">1280x720</option>
                <option value="1920x1080">1920x1080</option>
              </select>
            </div>
            <button onClick={onClose} className="close-btn">Close</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Equipment Library Component
const EquipmentLibrary = () => {
  const { equipment } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="equipment-library">
      <h2>Equipment Library</h2>
      <div className="search-container">
        <input
          type="text"
          placeholder="Search equipment..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="equipment-grid">
        {filteredEquipment.map(item => (
          <motion.div
            key={item.id}
            whileHover={{ scale: 1.05, rotateY: 5 }}
            className="equipment-card"
          >
            <div className="equipment-image"></div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <div className="equipment-status">
              <span className={`criticality ${item.criticality.toLowerCase()}`}>
                {item.criticality}
              </span>
              <span className={`status ${item.status}`}>
                {item.status}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// Diagnostics Timeline Component
const DiagnosticsTimeline = () => {
  const { diagnostics } = useStore();

  return (
    <section className="diagnostics-timeline">
      <h2>Diagnostics Timeline</h2>
      <div className="timeline">
        {diagnostics.map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="timeline-item"
          >
            <div className="timeline-node"></div>
            <div className="timeline-content">
              <h4>{item.event}</h4>
              <p>Confidence: {(item.confidence * 100).toFixed(1)}%</p>
              <span className="timeline-time">
                {new Date(item.timestamp).toLocaleString()}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// Main App Component
function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [currentSection, setCurrentSection] = useState('hero');

  return (
    <div className="App">
      {/* Navigation */}
      <nav className="navigation">
        <div className="nav-brand">AR Object Spotter</div>
        <div className="nav-links">
          <button onClick={() => setCurrentSection('hero')} className={currentSection === 'hero' ? 'active' : ''}>
            Mission
          </button>
          <button onClick={() => setCurrentSection('console')} className={currentSection === 'console' ? 'active' : ''}>
            Detection
          </button>
          <button onClick={() => setCurrentSection('equipment')} className={currentSection === 'equipment' ? 'active' : ''}>
            Equipment
          </button>
          <button onClick={() => setCurrentSection('diagnostics')} className={currentSection === 'diagnostics' ? 'active' : ''}>
            Diagnostics
          </button>
          <button onClick={() => setShowSettings(true)}>⚙️</button>
        </div>
      </nav>

      {/* Hero Section */}
      {currentSection === 'hero' && (
        <section className="hero-section">
          <div className="stars"></div>
          <div className="hero-content">
            <motion.h1
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
            >
              Fix the Station with AR Vision
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
            >
              Advanced object detection system for space station maintenance and repair operations
            </motion.p>
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              whileHover={{ scale: 1.05, glow: 1 }}
              onClick={() => setCurrentSection('console')}
              className="hero-cta"
            >
              Start Mission
            </motion.button>
          </div>
          <div className="hero-visual">
            <div className="space-station"></div>
          </div>
        </section>
      )}

      {/* Detection Console */}
      {currentSection === 'console' && <DetectionConsole />}

      {/* Equipment Library */}
      {currentSection === 'equipment' && <EquipmentLibrary />}

      {/* Diagnostics Timeline */}
      {currentSection === 'diagnostics' && <DiagnosticsTimeline />}

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

export default App;