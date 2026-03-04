import React, { useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polygon, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// ── Global state ──
let normParams = null;

// ── Talomo District Boundary (fitted to actual data coverage) ──
const talomoBoundary = [
  [7.045, 125.530],
  [7.045, 125.575],
  [7.072, 125.575],
  [7.072, 125.530],
  [7.045, 125.530]
];

// ── Helper functions ──
function getRecommendationLevel(score) {
  if (score >= 0.6) return 1; // Highly Recommended
  if (score >= 0.4) return 2; // Recommended
  if (score >= 0.2) return 3; // Conditionally Recommended
  return 0; // Not Recommended
}

function getRecommendationText(level) {
  const texts = {
    1: 'Highly Recommended',
    2: 'Recommended',
    3: 'Conditionally Recommended',
    0: 'Not Recommended'
  };
  return texts[level] || 'Not Recommended';
}

function getRecommendationColor(level) {
  const colors = {
    1: '#1a9850',
    2: '#91cf60',
    3: '#fee08b',
    0: '#d73027'
  };
  return colors[level] || '#999';
}

function classifyScore(score) {
  if (score <= 0.2) return 'Very Low';
  if (score <= 0.4) return 'Low';
  if (score <= 0.6) return 'Moderate';
  if (score <= 0.8) return 'High';
  return 'Very High';
}

function getColor(classification) {
  const colors = {
    'Very Low': '#d73027',
    'Low': '#fc8d59',
    'Moderate': '#fee08b',
    'High': '#91cf60',
    'Very High': '#1a9850',
  };
  return colors[classification] || '#999';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Map click handler ──
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Main App ──
export default function App() {
  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState('recommendation');
  const [config, setConfig] = useState('both');
  const [results, setResults] = useState([]);
  const [evalResult, setEvalResult] = useState(null);
  const [searchRadius, setSearchRadius] = useState('');
  const [searchLat, setSearchLat] = useState('');
  const [searchLon, setSearchLon] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [evalPoint, setEvalPoint] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Models state
  const [modelA, setModelA] = useState(null);
  const [modelB, setModelB] = useState(null);
  
  // Evaluation mode specific coordinates
  const [evalLat, setEvalLat] = useState('');
  const [evalLon, setEvalLon] = useState('');
  
  // Recommendation mode filters
  const [minPopulation, setMinPopulation] = useState('');
  const [maxFacilityDistance, setMaxFacilityDistance] = useState('');
  const [minRoadAccess, setMinRoadAccess] = useState('');
  
  // Selected site for detailed view
  const [selectedSite, setSelectedSite] = useState(null);
  
  // Error messages
  const [recommendError, setRecommendError] = useState('');
  const [evalError, setEvalError] = useState('');
  
  // Welcome screen
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedWelcomeMode, setSelectedWelcomeMode] = useState(null);
  
  // Mode switch confirmation
  const [pendingMode, setPendingMode] = useState(null);

  // ── Load models and data on mount ──
  useEffect(() => {
    async function init() {
      try {
        const loadedModelA = await tf.loadLayersModel('/models/model_a/model.json');
        const loadedModelB = await tf.loadLayersModel('/models/model_b/model.json');
        
        setModelA(loadedModelA);
        setModelB(loadedModelB);

        const normRes = await fetch('/data/normalization_params.json');
        normParams = await normRes.json();

        const sitesRes = await fetch('/data/candidate_sites.json');
        const sitesData = await sitesRes.json();
        setSites(sitesData);
        setReady(true);
        
        console.log('Models loaded successfully');
      } catch (error) {
        console.error('Error loading models:', error);
        alert('Failed to load models. Please refresh the page.');
      }
    }
    init();
  }, []);

  // ── Recommendation Mode ──
  function runRecommendation(lat, lon) {
    const radius = parseFloat(searchRadius);
    
    let nearby = sites.filter(
      (s) => haversineKm(lat, lon, s.latitude, s.longitude) <= radius
    );

    console.log(`Found ${nearby.length} sites within ${radius}km`);

    // Apply optional filters only if they have values
    if (minPopulation && minPopulation !== '' && !isNaN(parseFloat(minPopulation))) {
      const minPop = parseFloat(minPopulation);
      nearby = nearby.filter(s => (s.building_density_norm * 10000) >= minPop);
      console.log(`After min population filter: ${nearby.length} sites`);
    }

    if (maxFacilityDistance && maxFacilityDistance !== '' && !isNaN(parseFloat(maxFacilityDistance))) {
      const maxDist = parseFloat(maxFacilityDistance);
      nearby = nearby.filter(s => (s.facility_distance_norm * 10) <= maxDist);
      console.log(`After max facility distance filter: ${nearby.length} sites`);
    }

    if (minRoadAccess && minRoadAccess !== '' && !isNaN(parseFloat(minRoadAccess))) {
      const minAccess = parseFloat(minRoadAccess);
      nearby = nearby.filter(s => s.road_accessibility_norm >= minAccess);
      console.log(`After min road access filter: ${nearby.length} sites`);
    }

    // Sort based on selected model configuration
    let sorted;
    if (config === 'modelA') {
      sorted = [...nearby].sort((a, b) => b.pred_score_A - a.pred_score_A);
    } else if (config === 'modelB') {
      sorted = [...nearby].sort((a, b) => b.pred_score_B - a.pred_score_B);
    } else {
      // For comparison mode, sort by average of both scores
      sorted = [...nearby].sort((a, b) => {
        const avgA = (a.pred_score_A + a.pred_score_B) / 2;
        const avgB = (b.pred_score_A + b.pred_score_B) / 2;
        return avgB - avgA;
      });
    }

    const ranked = sorted.map((site, i) => ({
      ...site,
      localRank: i + 1,
      classChanged: site.class_A !== site.class_B,
      scoreDiff: (site.pred_score_A - site.pred_score_B).toFixed(4),
    }));

    console.log(`Final results: ${ranked.length} sites`);
    setResults(ranked);
    setEvalResult(null);
    setSelectedSite(null);
  }

  // ── Evaluation Mode ──
  async function runEvaluation(lat, lon) {
    if (!modelA || !modelB) {
      console.error('Models not loaded yet');
      setEvalError('Models are still loading. Please wait a moment and try again');
      return;
    }

    setEvalError('');
    setIsEvaluating(true);
    setEvalPoint({ lat, lon });
    
    // Normalize input features
    const buildingDensity = 0.5; // Placeholder - would come from GIS data
    const roadAccessibility = 0.5;
    const facilityDistance = 0.5;
    const flood = 0.3;
    const landslide = 0.2;
    const stormsurge = 0.1;

    try {
      // Prepare inputs for both models
      const inputA = tf.tensor2d([[buildingDensity, roadAccessibility, facilityDistance]]);
      const inputB = tf.tensor2d([[buildingDensity, roadAccessibility, facilityDistance, flood, landslide, stormsurge]]);

      // Get predictions
      const predA = modelA.predict(inputA);
      const predB = modelB.predict(inputB);
      
      const scoreA = (await predA.data())[0];
      const scoreB = (await predB.data())[0];

      // Clean up tensors
      inputA.dispose();
      inputB.dispose();
      predA.dispose();
      predB.dispose();

      // Classify scores
      const classA = classifyScore(scoreA);
      const classB = classifyScore(scoreB);
      
      const levelA = getRecommendationLevel(scoreA);
      const levelB = getRecommendationLevel(scoreB);

      const result = {
        lat,
        lon,
        scoreA,
        scoreB,
        classA,
        classB,
        levelA,
        levelB,
        factors: {
          buildingDensity,
          roadAccessibility,
          facilityDistance,
          flood,
          landslide,
          stormsurge
        }
      };

      console.log('Evaluation result:', result);
      setEvalResult(result);
      setResults([]);
      setIsEvaluating(false);
      
      // Scroll to results
      setTimeout(() => {
        const resultsEl = document.querySelector('.results');
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    } catch (error) {
      console.error('Error during evaluation:', error);
      setEvalError('Error during evaluation: ' + error.message);
      setIsEvaluating(false);
    }
  }

  // ── Handle exit map ──
  function handleExitMap() {
    setShowWelcome(true);
    setSelectedWelcomeMode(null);
    setResults([]);
    setEvalResult(null);
    setEvalPoint(null);
    setSelectedSite(null);
    setSearchLat('');
    setSearchLon('');
    setEvalLat('');
    setEvalLon('');
    setRecommendError('');
    setEvalError('');
    setHasSearched(false);
  }

  // ── Handle mode switch with confirmation ──
  function handleModeSwitch(newMode) {
    if (newMode === mode) return; // Already in this mode
    setPendingMode(newMode);
  }

  function confirmModeSwitch() {
    if (pendingMode === 'recommendation') {
      setMode('recommendation');
      setResults([]);
      setEvalResult(null);
      setEvalPoint(null);
      setSelectedSite(null);
      setEvalLat('');
      setEvalLon('');
      setEvalError('');
    } else if (pendingMode === 'evaluation') {
      setMode('evaluation');
      setResults([]);
      setEvalResult(null);
      setHasSearched(false);
      setEvalPoint(null);
      setSelectedSite(null);
      setSearchLat('');
      setSearchLon('');
      setRecommendError('');
    }
    setPendingMode(null);
  }

  function cancelModeSwitch() {
    setPendingMode(null);
  }
  function handleMapClick(lat, lon) {
    if (mode === 'recommendation') {
      // In recommendation mode, set search center coordinates
      setSearchLat(lat.toFixed(6));
      setSearchLon(lon.toFixed(6));
      setRecommendError('');
    } else {
      // In evaluation mode, set evaluation coordinates and run immediately
      setEvalLat(lat.toFixed(6));
      setEvalLon(lon.toFixed(6));
      setEvalError('');
      runEvaluation(lat, lon);
    }
  }

  // ── Handle recommend button click ──
  function handleRecommend() {
    setRecommendError('');
    
    const lat = parseFloat(searchLat);
    const lon = parseFloat(searchLon);
    const radius = parseFloat(searchRadius);
    
    if (isNaN(lat) || isNaN(lon)) {
      setRecommendError('Please click on the map or enter valid coordinates');
      return;
    }
    
    if (isNaN(radius) || radius <= 0 || radius > 50) {
      setRecommendError('Please enter a valid radius between 0.1 and 50 km');
      return;
    }
    
    runRecommendation(lat, lon);
    setHasSearched(true);
  }

  // ── Handle manual search ──
  function handleSearch() {
    setEvalError('');
    
    if (mode === 'evaluation') {
      const lat = parseFloat(evalLat);
      const lon = parseFloat(evalLon);
      if (isNaN(lat) || isNaN(lon)) {
        setEvalError('Please enter valid latitude and longitude coordinates');
        return;
      }
      runEvaluation(lat, lon);
    }
  }

  if (!ready) {
    return (
      <div className="loading">
        <h2>Loading Locentra...</h2>
        <p>Initializing TensorFlow.js models and candidate site data.</p>
      </div>
    );
  }

  // Welcome screen
  if (showWelcome) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '600px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#1a5276', fontSize: '32px', marginBottom: '16px' }}>
            Welcome to Locentra
          </h1>
          <p style={{ color: '#666', fontSize: '16px', marginBottom: '32px', lineHeight: '1.6' }}>
            GIS-Based Decision Support for Health Facility Site Selection
          </p>
          
          <h3 style={{ color: '#1a5276', fontSize: '20px', marginBottom: '24px' }}>
            What would you like to do?
          </h3>
          
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '24px' }}>
            <button
              onClick={() => setSelectedWelcomeMode(selectedWelcomeMode === 'recommendation' ? null : 'recommendation')}
              style={{
                flex: 1,
                padding: '24px',
                border: selectedWelcomeMode === 'recommendation' ? '3px solid #1a5276' : '2px solid #ccc',
                borderRadius: '12px',
                backgroundColor: selectedWelcomeMode === 'recommendation' ? '#e3f2fd' : 'white',
                cursor: 'pointer',
                transition: 'all 0.3s',
                maxWidth: '250px'
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
              <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#1a5276' }}>Recommendation</h4>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Find suitable sites within a specific area
              </p>
            </button>
            
            <button
              onClick={() => setSelectedWelcomeMode(selectedWelcomeMode === 'evaluation' ? null : 'evaluation')}
              style={{
                flex: 1,
                padding: '24px',
                border: selectedWelcomeMode === 'evaluation' ? '3px solid #1a5276' : '2px solid #ccc',
                borderRadius: '12px',
                backgroundColor: selectedWelcomeMode === 'evaluation' ? '#e3f2fd' : 'white',
                cursor: 'pointer',
                transition: 'all 0.3s',
                maxWidth: '250px'
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
              <h4 style={{ fontSize: '18px', marginBottom: '8px', color: '#1a5276' }}>Evaluation</h4>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Assess suitability of a specific location
              </p>
            </button>
          </div>
          
          <button
            onClick={() => {
              if (selectedWelcomeMode) {
                setMode(selectedWelcomeMode);
                setShowWelcome(false);
              }
            }}
            disabled={!selectedWelcomeMode}
            style={{
              padding: '14px 32px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: selectedWelcomeMode ? '#1a5276' : '#ccc',
              color: 'white',
              cursor: selectedWelcomeMode ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s',
              width: '200px'
            }}
          >
            🗺️ Enter Map
          </button>
          
          {!selectedWelcomeMode && (
            <p style={{ marginTop: '16px', fontSize: '13px', color: '#999' }}>
              Please select a mode to continue
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Navigation Bar */}
      <nav style={{
        backgroundColor: '#1a5276',
        padding: '16px 0',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ color: 'white', margin: 0, fontSize: '24px' }}>Locentra</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '4px 0 0 0', fontSize: '13px' }}>
              GIS-Based Decision Support System
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleModeSwitch('recommendation')}
              style={{
                padding: '10px 20px',
                border: mode === 'recommendation' ? '2px solid white' : '2px solid transparent',
                borderRadius: '6px',
                backgroundColor: mode === 'recommendation' ? 'white' : 'rgba(255,255,255,0.1)',
                color: mode === 'recommendation' ? '#1a5276' : 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              🔍 Recommendation
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('evaluation')}
              style={{
                padding: '10px 20px',
                border: mode === 'evaluation' ? '2px solid white' : '2px solid transparent',
                borderRadius: '6px',
                backgroundColor: mode === 'evaluation' ? 'white' : 'rgba(255,255,255,0.1)',
                color: mode === 'evaluation' ? '#1a5276' : 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              📊 Evaluation
            </button>
            
            <div style={{ width: '1px', height: '30px', backgroundColor: 'rgba(255,255,255,0.3)', margin: '0 4px' }}></div>
            
            <button
              type="button"
              onClick={handleExitMap}
              style={{
                padding: '10px 20px',
                border: '2px solid rgba(255,255,255,0.5)',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
            >
              🚪 Exit Map
            </button>
          </div>
        </div>
      </nav>

      {/* Mode Switch Confirmation Dialog */}
      {pendingMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '450px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ color: '#1a5276', marginBottom: '16px', fontSize: '20px' }}>
              Switch to {pendingMode === 'recommendation' ? 'Recommendation' : 'Evaluation'} Mode?
            </h3>
            <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
              Switching modes will clear your current search results and inputs. Are you sure you want to continue?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelModeSwitch}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmModeSwitch}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#1a5276',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Switch Mode
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <p>GIS-Based Decision Support for Health Facility Site Selection</p>
        {!modelA || !modelB ? (
          <div style={{ 
            marginTop: '10px', 
            padding: '8px 16px', 
            backgroundColor: '#fff3cd', 
            borderRadius: '4px',
            display: 'inline-block',
            fontSize: '14px'
          }}>
            ⏳ Models are loading...
          </div>
        ) : (
          <div style={{ 
            marginTop: '10px', 
            padding: '8px 16px', 
            backgroundColor: '#d4edda', 
            borderRadius: '4px',
            display: 'inline-block',
            fontSize: '14px',
            color: '#155724'
          }}>
            ✓ Models ready
          </div>
        )}
      </header>

      {/* ── Controls ── */}
      <div className="controls">
        <div className="control-row">
          <div className="control-group">
            <label>Hazard Config:</label>
            <button type="button" className={config === 'modelA' ? 'active' : ''} onClick={() => setConfig('modelA')}>
              Model A Only
            </button>
            <button type="button" className={config === 'modelB' ? 'active' : ''} onClick={() => setConfig('modelB')}>
              Model B Only
            </button>
            <button type="button" className={config === 'both' ? 'active' : ''} onClick={() => setConfig('both')}>
              Comparison
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="control-group-full">
            {mode === 'evaluation' ? (
              <>
                <label>Location:</label>
                <input
                  type="text"
                  placeholder="Latitude"
                  value={evalLat}
                  onChange={(e) => setEvalLat(e.target.value)}
                  className="input-equal"
                />
                <input
                  type="text"
                  placeholder="Longitude"
                  value={evalLon}
                  onChange={(e) => setEvalLon(e.target.value)}
                  className="input-equal"
                />
                <button onClick={handleSearch} className="search-btn" type="button">Evaluate Location</button>
                {evalError && (
                  <span style={{ color: '#dc3545', fontStyle: 'italic', fontSize: '14px', marginLeft: '10px' }}>
                    {evalError}
                  </span>
                )}
              </>
            ) : (
              <>
                <label>Search Center:</label>
                <input
                  type="text"
                  placeholder="Latitude (click map)"
                  value={searchLat}
                  onChange={(e) => setSearchLat(e.target.value)}
                  className="input-equal"
                />
                <input
                  type="text"
                  placeholder="Longitude (click map)"
                  value={searchLon}
                  onChange={(e) => setSearchLon(e.target.value)}
                  className="input-equal"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(e.target.value)}
                  placeholder="Radius (km)"
                  className="input-equal"
                  style={{ maxWidth: '150px' }}
                />
              </>
            )}
          </div>
        </div>

        {mode === 'recommendation' && (
          <div className="control-row">
            <div className="control-group-full">
              <label style={{ color: '#888', fontWeight: 'normal' }}>Additional Filters (Optional):</label>
              <input
                type="number"
                placeholder="Min Population"
                value={minPopulation}
                onChange={(e) => setMinPopulation(e.target.value)}
                className="input-equal"
                title="Optional: Filter by minimum estimated population"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Max Facility Distance (km)"
                value={maxFacilityDistance}
                onChange={(e) => setMaxFacilityDistance(e.target.value)}
                className="input-equal"
                title="Optional: Filter by maximum distance to healthcare facility"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                placeholder="Min Road Access (0-1)"
                value={minRoadAccess}
                onChange={(e) => setMinRoadAccess(e.target.value)}
                className="input-equal"
                title="Optional: Filter by minimum road accessibility score"
              />
              <button onClick={handleRecommend} className="search-btn" type="button" style={{ marginLeft: '10px' }}>
                🔍 Recommend Sites
              </button>
              {recommendError && (
                <span style={{ color: '#dc3545', fontStyle: 'italic', fontSize: '14px', marginLeft: '10px' }}>
                  {recommendError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div className="map-container">
        <MapContainer
          center={[7.05, 125.55]}
          zoom={13}
          style={{ height: '500px', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <MapClickHandler onMapClick={handleMapClick} />

          {/* Talomo District Boundary */}
          <Polygon
            positions={talomoBoundary}
            pathOptions={{
              color: '#1a5276',
              weight: 3,
              opacity: 0.8,
              fillColor: '#3498db',
              fillOpacity: 0.1,
              dashArray: '10, 10'
            }}
            interactive={false}
          />

          {/* Show all candidate sites only in recommendation mode after search */}
          {mode === 'recommendation' && hasSearched && sites.map((site) => {
            const classKey = config === 'modelA' ? 'class_A' : 'class_B';
            return (
              <CircleMarker
                key={site.site_id}
                center={[site.latitude, site.longitude]}
                radius={3}
                fillColor={getColor(site[classKey])}
                color={getColor(site[classKey])}
                fillOpacity={0.6}
                opacity={0.6}
              >
                <Popup>
                  <strong>{site.site_id}</strong>
                  <br />Score A: {site.pred_score_A.toFixed(4)} ({site.class_A})
                  <br />Score B: {site.pred_score_B.toFixed(4)} ({site.class_B})
                  <br />Rank A: {site.rank_A} | Rank B: {site.rank_B}
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Highlighted results in recommendation mode */}
          {mode === 'recommendation' && results.map((site) => (
            <CircleMarker
              key={`res-${site.site_id}`}
              center={[site.latitude, site.longitude]}
              radius={7}
              fillColor="#ff0000"
              color="#ff0000"
              fillOpacity={0.9}
              opacity={0.9}
            >
              {/* Tooltip shows on hover with View Details button */}
              <Tooltip 
                direction="top" 
                offset={[0, -10]} 
                opacity={0.95}
                permanent={false}
                interactive={true}
              >
                <div style={{ minWidth: '200px', fontSize: '12px' }}>
                  <strong style={{ fontSize: '14px' }}>{site.site_id}</strong>
                  <div style={{ marginTop: '6px' }}>
                    <div>📍 Rank: #{site.localRank}</div>
                    <div style={{ marginTop: '4px' }}>
                      <strong>Model A:</strong> {site.pred_score_A.toFixed(4)}
                      <br />
                      <span style={{ color: getColor(site.class_A) }}>({site.class_A})</span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <strong>Model B:</strong> {site.pred_score_B.toFixed(4)}
                      <br />
                      <span style={{ color: getColor(site.class_B) }}>({site.class_B})</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSite(site);
                    }}
                    style={{
                      marginTop: '10px',
                      padding: '6px 12px',
                      background: '#1a5276',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      width: '100%'
                    }}
                  >
                    📊 View Full Details
                  </button>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

          {/* Search center marker in recommendation mode */}
          {mode === 'recommendation' && searchLat && searchLon && !isNaN(parseFloat(searchLat)) && !isNaN(parseFloat(searchLon)) && (
            <CircleMarker
              center={[parseFloat(searchLat), parseFloat(searchLon)]}
              radius={10}
              fillColor="#ff6b00"
              color="#ffffff"
              fillOpacity={0.8}
              opacity={1}
              weight={3}
            >
              <Popup>
                <strong>🎯 Search Center</strong>
                <br />Lat: {parseFloat(searchLat).toFixed(6)}
                <br />Lon: {parseFloat(searchLon).toFixed(6)}
                {searchRadius && <><br />Radius: {searchRadius} km</>}
              </Popup>
            </CircleMarker>
          )}

          {/* Evaluation point marker */}
          {mode === 'evaluation' && evalPoint && (
            <CircleMarker
              center={[evalPoint.lat, evalPoint.lon]}
              radius={8}
              fillColor="#0066ff"
              color="#0066ff"
              fillOpacity={0.8}
              opacity={1}
            >
              <Popup>
                <strong>Evaluation Point</strong>
                <br />Lat: {evalPoint.lat.toFixed(6)}
                <br />Lon: {evalPoint.lon.toFixed(6)}
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      {/* ── Recommendation Results ── */}
      {mode === 'recommendation' && hasSearched && results.length === 0 && (
        <div className="results">
          <h3>No Recommended Sites Found</h3>
          <p style={{ color: '#666', marginTop: '10px' }}>
            No sites matching your criteria were found within {searchRadius}km of the selected location.
          </p>
          <p style={{ color: '#666', marginTop: '10px' }}>
            Try:
          </p>
          <ul style={{ color: '#666', marginLeft: '20px' }}>
            <li>Increasing the search radius</li>
            <li>Removing or relaxing the optional filters</li>
            <li>Selecting a different location on the map</li>
          </ul>
        </div>
      )}

      {mode === 'recommendation' && results.length > 0 && (
        <div className="results">
          <h3>Recommended Sites ({results.length} within {searchRadius}km)</h3>
          <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '10px' }}>
            Click on any site row to view detailed information
          </p>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Site ID</th>
                <th>Score A</th>
                <th>Class A</th>
                <th>Score B</th>
                <th>Class B</th>
                <th>Diff</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 20).map((site) => {
                const score = config === 'modelA' ? site.pred_score_A : site.pred_score_B;
                const level = getRecommendationLevel(score);
                return (
                  <tr 
                    key={site.site_id} 
                    style={{
                      backgroundColor: selectedSite?.site_id === site.site_id ? '#e3f2fd' : (site.classChanged ? '#fff3cd' : 'transparent'),
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedSite(site)}
                  >
                    <td>{site.localRank}</td>
                    <td><strong>{site.site_id}</strong></td>
                    <td>{site.pred_score_A.toFixed(4)}</td>
                    <td style={{ color: getColor(site.class_A) }}>{site.class_A}</td>
                    <td>{site.pred_score_B.toFixed(4)}</td>
                    <td style={{ color: getColor(site.class_B) }}>{site.class_B}</td>
                    <td>{site.scoreDiff}</td>
                    <td style={{ 
                      color: getRecommendationColor(level),
                      fontWeight: 'bold'
                    }}>
                      Level {level}: {getRecommendationText(level)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Selected Site Details */}
          {selectedSite && (
            <>
              {/* Modal Overlay */}
              <div 
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 9998,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setSelectedSite(null)}
              >
                {/* Modal Content */}
                <div 
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '900px',
                    maxHeight: '85vh',
                    overflow: 'auto',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                    zIndex: 9999,
                    margin: '20px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ color: '#1a5276', margin: 0, fontSize: '22px' }}>📍 Site Details: {selectedSite.site_id}</h3>
                    <button 
                      onClick={() => setSelectedSite(null)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        background: '#dc3545',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                      <h4 style={{ color: '#1a5276', marginBottom: '12px', fontSize: '16px' }}>Location Information</h4>
                      <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Latitude:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.latitude.toFixed(6)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Longitude:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.longitude.toFixed(6)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Local Rank:</td>
                            <td style={{ padding: '8px 0' }}>#{selectedSite.localRank} of {results.length}</td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 style={{ color: '#1a5276', marginTop: '20px', marginBottom: '12px', fontSize: '16px' }}>Spatial Factors</h4>
                      <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Building Density:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.building_density_norm.toFixed(4)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Road Accessibility:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.road_accessibility_norm.toFixed(4)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Facility Distance:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.facility_distance_norm.toFixed(4)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 style={{ color: '#1a5276', marginBottom: '12px', fontSize: '16px' }}>Suitability Assessment</h4>
                      <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}></th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Model A</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Model B</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>Score:</td>
                            <td style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold' }}>{selectedSite.pred_score_A.toFixed(4)}</td>
                            <td style={{ padding: '10px', fontSize: '16px', fontWeight: 'bold' }}>{selectedSite.pred_score_B.toFixed(4)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>Class:</td>
                            <td style={{ padding: '10px', color: getColor(selectedSite.class_A), fontWeight: 'bold' }}>{selectedSite.class_A}</td>
                            <td style={{ padding: '10px', color: getColor(selectedSite.class_B), fontWeight: 'bold' }}>{selectedSite.class_B}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>Global Rank:</td>
                            <td style={{ padding: '10px' }}>{selectedSite.rank_A} / {sites.length}</td>
                            <td style={{ padding: '10px' }}>{selectedSite.rank_B} / {sites.length}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>Recommendation:</td>
                            <td style={{ padding: '10px', color: getRecommendationColor(getRecommendationLevel(selectedSite.pred_score_A)), fontWeight: 'bold' }}>
                              Level {getRecommendationLevel(selectedSite.pred_score_A)}
                            </td>
                            <td style={{ padding: '10px', color: getRecommendationColor(getRecommendationLevel(selectedSite.pred_score_B)), fontWeight: 'bold' }}>
                              Level {getRecommendationLevel(selectedSite.pred_score_B)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <h4 style={{ color: '#1a5276', marginTop: '20px', marginBottom: '12px', fontSize: '16px' }}>Hazard Risk Factors</h4>
                      <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Flood Risk:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.flood_norm.toFixed(4)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Landslide Risk:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.landslide_norm.toFixed(4)}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Storm Surge Risk:</td>
                            <td style={{ padding: '8px 0' }}>{selectedSite.stormsurge_norm.toFixed(4)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedSite.class_A !== selectedSite.class_B && (
                    <div style={{ 
                      marginTop: '20px', 
                      padding: '14px', 
                      backgroundColor: '#fff3cd', 
                      borderRadius: '6px',
                      borderLeft: '4px solid #ffc107',
                      fontSize: '14px'
                    }}>
                      ⚠️ <strong>Note:</strong> Classification changes from <strong>{selectedSite.class_A}</strong> to{' '}
                      <strong>{selectedSite.class_B}</strong> when hazard factors are included.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Evaluation Result ── */}
      {mode === 'evaluation' && isEvaluating && (
        <div className="results">
          <h3>Evaluating location...</h3>
          <p>Running suitability analysis...</p>
        </div>
      )}
      
      {mode === 'evaluation' && evalResult && (
        <div className="results">
          <h3>Location Suitability Evaluation</h3>
          <div className="eval-card">
            <h4>📍 Location: {evalResult.lat.toFixed(6)}, {evalResult.lon.toFixed(6)}</h4>
            
            <h4>Suitability Scores</h4>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Model A (Service-Oriented)</th>
                  <th>Model B (Resilience-Aware)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Suitability Score</strong></td>
                  <td style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{evalResult.scoreA.toFixed(4)}</td>
                  <td style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{evalResult.scoreB.toFixed(4)}</td>
                </tr>
                <tr>
                  <td><strong>Classification</strong></td>
                  <td style={{ color: getColor(evalResult.classA), fontWeight: 'bold' }}>{evalResult.classA}</td>
                  <td style={{ color: getColor(evalResult.classB), fontWeight: 'bold' }}>{evalResult.classB}</td>
                </tr>
                <tr>
                  <td><strong>Recommendation</strong></td>
                  <td style={{ 
                    color: getRecommendationColor(evalResult.levelA), 
                    fontWeight: 'bold',
                    fontSize: '1.1em'
                  }}>
                    Level {evalResult.levelA}: {getRecommendationText(evalResult.levelA)}
                  </td>
                  <td style={{ 
                    color: getRecommendationColor(evalResult.levelB), 
                    fontWeight: 'bold',
                    fontSize: '1.1em'
                  }}>
                    Level {evalResult.levelB}: {getRecommendationText(evalResult.levelB)}
                  </td>
                </tr>
              </tbody>
            </table>

            {evalResult.classA !== evalResult.classB && (
              <p className="warning" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                ⚠️ Classification changes from <strong>{evalResult.classA}</strong> to{' '}
                <strong>{evalResult.classB}</strong> when hazard factors are included.
              </p>
            )}
            
            <h4 style={{ marginTop: '20px' }}>Spatial Factors (Normalized 0-1)</h4>
            <table>
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Value</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Building Density</strong></td>
                  <td>{evalResult.factors.buildingDensity.toFixed(4)}</td>
                  <td>Population density indicator</td>
                </tr>
                <tr>
                  <td><strong>Road Accessibility</strong></td>
                  <td>{evalResult.factors.roadAccessibility.toFixed(4)}</td>
                  <td>Proximity to road network</td>
                </tr>
                <tr>
                  <td><strong>Facility Distance</strong></td>
                  <td>{evalResult.factors.facilityDistance.toFixed(4)}</td>
                  <td>Distance to nearest healthcare facility</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ marginTop: '20px' }}>Hazard Risk Factors (Normalized 0-1)</h4>
            <table>
              <thead>
                <tr>
                  <th>Hazard Type</th>
                  <th>Risk Level</th>
                  <th>Classification</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Flood Risk</strong></td>
                  <td>{evalResult.factors.flood.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.flood > 0.5 ? '#d73027' : '#1a9850' }}>
                    {evalResult.factors.flood > 0.5 ? 'High' : 'Low'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Landslide Risk</strong></td>
                  <td>{evalResult.factors.landslide.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.landslide > 0.5 ? '#d73027' : '#1a9850' }}>
                    {evalResult.factors.landslide > 0.5 ? 'High' : 'Low'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Storm Surge Risk</strong></td>
                  <td>{evalResult.factors.stormsurge.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.stormsurge > 0.5 ? '#d73027' : '#1a9850' }}>
                    {evalResult.factors.stormsurge > 0.5 ? 'High' : 'Low'}
                  </td>
                </tr>
              </tbody>
            </table>

            <p style={{ fontSize: '0.9em', color: '#666', marginTop: '15px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
              ℹ️ <strong>Note:</strong> Factor values are currently using placeholder data for demonstration. 
              In production, these would be extracted from actual GIS layers (population census, road networks, 
              hazard maps, etc.) based on the selected coordinates.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}