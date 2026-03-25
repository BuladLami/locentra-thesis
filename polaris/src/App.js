import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// ── Global state ──
// (No global state needed - all data comes from JSON)

// ── Talomo District Boundary (approximate irregular shape) ──
// Note: Replace with actual boundary coordinates from GeoJSON/shapefile if available
const talomoBoundary = [
  [7.020, 125.480],  // Northwest corner
  [7.030, 125.460],  // Further west
  [7.050, 125.450],  // West side
  [7.070, 125.455],  // Southwest
  [7.085, 125.470],  // South
  [7.095, 125.490],  // Southeast inland
  [7.100, 125.520],  // South central
  [7.095, 125.550],  // Southeast coast
  [7.085, 125.580],  // East coast
  [7.075, 125.600],  // Northeast coast
  [7.065, 125.615],  // Far northeast
  [7.050, 125.620],  // East side
  [7.035, 125.610],  // Northeast inland
  [7.025, 125.590],  // North central
  [7.020, 125.560],  // North
  [7.018, 125.530],  // Northwest inland
  [7.020, 125.480]   // Back to start
];

// ── Helper functions ──
function getRecommendationColor(level) {
  const colors = {
    1: '#fee08b',      // Level 1: Conditionally Suitable - Yellow
    2: '#91cf60',      // Level 2: Moderately Suitable - Light Green
    3: '#1a9850',      // Level 3: Highly Suitable - Dark Green
    0: '#d73027'       // Not Suitable - Red
  };
  return colors[level] || '#999';
}

function classifyScore(score) {
  if (score < 0.25) return 'Very Low';
  if (score < 0.40) return 'Low';
  if (score < 0.60) return 'Moderate';
  return 'High';
}

function getColor(classification) {
  const colors = {
    'Very Low': '#d73027',
    'Low': '#fc8d59',
    'Moderate': '#fee08b',
    'High': '#1a9850',
  };
  return colors[classification] || '#999';
}

// Tooltip helper component
function InfoTooltip({ text }) {
  return null; // No longer needed, using native title attributes
}

// Get recommendation level from score
function getRecommendationLevel(score) {
  if (score >= 0.6) return 3; // Highly Suitable
  if (score >= 0.4) return 2; // Moderately Suitable
  if (score >= 0.2) return 1; // Conditionally Suitable
  return 0; // Not Suitable
}

// Get recommendation text from level
function getRecommendationText(level) {
  const texts = {
    3: 'Highly Suitable',
    2: 'Moderately Suitable',
    1: 'Conditionally Suitable',
    0: 'Not Suitable'
  };
  return texts[level] || 'Unknown';
}

// Generate address based on coordinates (approximate barangay)
function generateAddress(lat, lon) {
  // Approximate barangay mapping based on coordinate ranges in Talomo District
  let barangay = 'Talomo';
  
  if (lat >= 7.08 && lon >= 125.55) {
    barangay = 'Talomo Proper';
  } else if (lat >= 7.07 && lat < 7.08 && lon >= 125.52) {
    barangay = 'Ma-a';
  } else if (lat < 7.05 && lon < 125.50) {
    barangay = 'Bago Aplaya';
  } else if (lat >= 7.05 && lat < 7.07 && lon < 125.52) {
    barangay = 'Catalunan Grande';
  } else if (lon >= 125.58) {
    barangay = 'Matina Crossing';
  }
  
  return barangay;
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
  
  // Evaluation mode specific coordinates
  const [evalLat, setEvalLat] = useState('');
  const [evalLon, setEvalLon] = useState('');
  
  // Recommendation mode filters
  const [minPopulation, setMinPopulation] = useState('');
  const [maxFacilityDistance, setMaxFacilityDistance] = useState('');
  const [minRoadAccess, setMinRoadAccess] = useState('');
  
  // Selected site for detailed view
  const [selectedSite, setSelectedSite] = useState(null);
  
  // Hovered site for glow effect
  const [hoveredSite, setHoveredSite] = useState(null);
  
  // Fullscreen map mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Error messages
  const [recommendError, setRecommendError] = useState('');
  const [evalError, setEvalError] = useState('');
  
  // Welcome screen
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedWelcomeMode, setSelectedWelcomeMode] = useState(null);
  
  // Mode switch confirmation
  const [pendingMode, setPendingMode] = useState(null);
  
  // Search area change confirmation
  const [pendingSearchLocation, setPendingSearchLocation] = useState(null);

  // ── Load data on mount ──
  useEffect(() => {
    async function init() {
      try {
        const sitesRes = await fetch('/data/candidate_sites.json');
        const sitesData = await sitesRes.json();
        setSites(sitesData);
        setReady(true);
        
        console.log('Data loaded successfully');
      } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load site data. Please refresh the page.');
      }
    }
    init();
  }, []);

  // ── Recommendation Mode ──
  function runRecommendation(lat, lon) {
    const radiusMeters = parseFloat(searchRadius);
    const radiusKm = radiusMeters / 1000; // Convert meters to km
    
    let nearby = sites.filter(
      (s) => haversineKm(lat, lon, s.latitude, s.longitude) <= radiusKm
    );

    console.log(`Found ${nearby.length} sites within ${radiusMeters}m (${radiusKm}km)`);

    // Apply 50-meter shoreline buffer - filter out sites too close to water
    // Sites with very high storm surge risk (>0.85) are likely within 50m of shoreline
    nearby = nearby.filter(s => s.stormsurge_norm < 0.85);
    console.log(`After 50m shoreline buffer: ${nearby.length} sites`);

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
      // Generate full address with barangay approximation based on coordinates
      address: generateAddress(site.latitude, site.longitude)
    }));

    console.log(`Final results: ${ranked.length} sites`);
    setResults(ranked);
    setEvalResult(null);
    setSelectedSite(null);
  }

  // ── Evaluation Mode ──
  function runEvaluation(lat, lon) {
    setEvalError('');
    setEvalPoint({ lat, lon });
    
    // Find nearest site
    let minDist = Infinity;
    let nearest = null;

    sites.forEach((site) => {
      const dist = haversineKm(lat, lon, site.latitude, site.longitude);
      if (dist < minDist) {
        minDist = dist;
        nearest = site;
      }
    });

    if (!nearest) {
      setEvalError('No sites found in the area');
      setEvalResult(null);
      return;
    }

    // Check if the location is in the sea or outside the district
    // If the nearest site is more than 1km away, it's likely in the sea
    if (minDist > 1.0) {
      setEvalError('This location appears to be in the sea or outside Talomo District. Please select a location on land within the district.');
      setEvalResult(null);
      return;
    }

    // Use the nearest site's pre-computed data from candidate_sites.json
    setEvalResult({
      lat,
      lon,
      site: nearest,
      distance: minDist,
      outsideCoverage: minDist > 0.5, // More than 500m away
      // Suitability scores from Python model
      scoreA: nearest.pred_score_A,
      scoreB: nearest.pred_score_B,
      classA: nearest.class_A,
      classB: nearest.class_B,
      levelA: nearest.rec_level_A,
      levelB: nearest.rec_level_B,
      rankA: nearest.rank_A,
      rankB: nearest.rank_B,
      // Location factors
      factors: {
        buildingDensity: nearest.building_density_norm,
        roadAccessibility: nearest.road_accessibility_norm,
        facilityDistance: nearest.facility_distance_norm,
        flood: nearest.flood_norm,
        landslide: nearest.landslide_norm,
        stormsurge: nearest.stormsurge_norm
      }
    });
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
  
  function confirmSearchAreaChange() {
    if (pendingSearchLocation) {
      if (pendingSearchLocation.isManual) {
        // Manual input change
        setSearchLat(pendingSearchLocation.newLat);
        setSearchLon(pendingSearchLocation.newLon);
      } else {
        // Map click change
        setSearchLat(pendingSearchLocation.lat.toFixed(6));
        setSearchLon(pendingSearchLocation.lon.toFixed(6));
      }
      setResults([]);
      setSelectedSite(null);
      setHasSearched(false);
      setRecommendError('');
      setPendingSearchLocation(null);
    }
  }
  
  function cancelSearchAreaChange() {
    setPendingSearchLocation(null);
  }
  
  function handleMapClick(lat, lon) {
    if (mode === 'recommendation') {
      // In recommendation mode, check if there are existing results
      if (hasSearched && results.length > 0) {
        // Show confirmation dialog when trying to change search center after getting results
        setPendingSearchLocation({ lat, lon });
      } else {
        // No results yet, directly set coordinates
        setSearchLat(lat.toFixed(6));
        setSearchLon(lon.toFixed(6));
        setRecommendError('');
      }
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
    const radiusMeters = parseFloat(searchRadius);
    
    if (isNaN(lat) || isNaN(lon)) {
      setRecommendError('Please click on the map or enter valid coordinates');
      return;
    }
    
    if (isNaN(radiusMeters) || radiusMeters < 100 || radiusMeters > 1000) {
      setRecommendError('Please enter a valid radius between 100 and 1,000 meters');
      return;
    }
    
    // Check if the search center is in the sea or outside the district
    // Find nearest site to the search center
    let minDist = Infinity;
    sites.forEach((site) => {
      const dist = haversineKm(lat, lon, site.latitude, site.longitude);
      if (dist < minDist) {
        minDist = dist;
      }
    });
    
    // If the nearest site is more than 1km away, it's likely in the sea or outside district
    if (minDist > 1.0) {
      setRecommendError('This location appears to be in the sea or outside Talomo District. Please select a location on land within the district.');
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
        <h2>Loading POLARIS...</h2>
        <p>Loading site data and preparing the map.</p>
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
            Welcome to POLARIS
          </h1>
          <p style={{ color: '#666', fontSize: '16px', marginBottom: '32px', lineHeight: '1.6' }}>
            Priority-Optimized Location and Risk-Adaptive Infrastructure Siting
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
        backgroundColor: '#0891b2',
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
            <h1 style={{ color: 'white', margin: 0, fontSize: '24px' }}>POLARIS</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: '4px 0 0 0', fontSize: '13px' }}>
              Priority-Optimized Location and Risk-Adaptive Infrastructure Siting
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
                color: mode === 'recommendation' ? '#0891b2' : 'white',
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
                color: mode === 'evaluation' ? '#0891b2' : 'white',
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
              onClick={() => setIsFullscreen(!isFullscreen)}
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
              {isFullscreen ? '� Show Controls' : '🗺️ Fullscreen Map'}
            </button>
            
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

      {/* Search Area Change Confirmation Dialog */}
      {pendingSearchLocation && (
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
              Change Current Search Area?
            </h3>
            <p style={{ color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
              Changing the search center will clear your current recommended sites and results. Do you want to continue?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelSearchAreaChange}
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
                onClick={confirmSearchAreaChange}
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
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      {!isFullscreen && (
        <div className="controls">

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
                  onChange={(e) => {
                    // Check if there are existing results
                    if (hasSearched && results.length > 0 && e.target.value !== searchLat) {
                      // Show confirmation dialog
                      setPendingSearchLocation({ 
                        lat: parseFloat(e.target.value) || 0, 
                        lon: parseFloat(searchLon) || 0,
                        isManual: true,
                        newLat: e.target.value,
                        newLon: searchLon
                      });
                    } else {
                      setSearchLat(e.target.value);
                    }
                  }}
                  className="input-equal"
                />
                <input
                  type="text"
                  placeholder="Longitude (click map)"
                  value={searchLon}
                  onChange={(e) => {
                    // Check if there are existing results
                    if (hasSearched && results.length > 0 && e.target.value !== searchLon) {
                      // Show confirmation dialog
                      setPendingSearchLocation({ 
                        lat: parseFloat(searchLat) || 0, 
                        lon: parseFloat(e.target.value) || 0,
                        isManual: true,
                        newLat: searchLat,
                        newLon: e.target.value
                      });
                    } else {
                      setSearchLon(e.target.value);
                    }
                  }}
                  className="input-equal"
                />
                <input
                  type="number"
                  step="100"
                  min="100"
                  max="1000"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(e.target.value)}
                  placeholder="Radius (meters)"
                  className="input-equal"
                  style={{ maxWidth: '180px' }}
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
      )}

      {/* ── Map with Floating Sidebar ── */}
      <div className="map-wrapper">
        <div className="map-container">
          <MapContainer
            center={[7.05, 125.55]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <MapClickHandler onMapClick={handleMapClick} />

            {/* Highlighted results in recommendation mode */}
            {mode === 'recommendation' && results.map((site) => {
              const isHovered = hoveredSite === site.site_id;
              const isSelected = selectedSite?.site_id === site.site_id;
              
              return (
                <CircleMarker
                  key={`res-${site.site_id}`}
                  center={[site.latitude, site.longitude]}
                  radius={isHovered || isSelected ? 14 : 8}
                  fillColor={isSelected ? "#0066ff" : "#2196F3"}
                  color={isSelected ? "#ffffff" : "#1976D2"}
                  fillOpacity={0.9}
                  opacity={1}
                  weight={isHovered || isSelected ? 3 : 2}
                  className={isHovered ? 'marker-glow' : ''}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      L.DomEvent.preventDefault(e);
                      setSelectedSite(site);
                    },
                    mouseover: () => {
                      setHoveredSite(site.site_id);
                    },
                    mouseout: () => {
                      setHoveredSite(null);
                    }
                  }}
                >
                  <Tooltip permanent={false} direction="top" offset={[0, -10]}>
                    <div style={{ textAlign: 'center' }}>
                      <strong>{site.site_id}</strong>
                      <br />
                      <span style={{ fontSize: '12px' }}>{site.address}</span>
                      <br />
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        Rank #{site.localRank}
                      </span>
                    </div>
                  </Tooltip>
                  <Popup>
                    <strong>{site.site_id}</strong>
                    <br />{site.address}
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Search center marker */}
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
                  {searchRadius && <><br />Radius: {searchRadius} meters</>}
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

        {/* Floating Sidebar for Recommendation Results */}
        {mode === 'recommendation' && hasSearched && !isFullscreen && (
          <div className="sidebar">
            <div className="sidebar-content">
              <h3 style={{ color: '#0891b2', marginBottom: '8px', fontSize: '18px' }}>
                Recommended Sites ({results.length})
              </h3>
              {results.length === 0 ? (
                <p style={{ color: '#666', fontSize: '14px' }}>
                  No sites found within {searchRadius}m. Try increasing the radius or adjusting filters.
                </p>
              ) : (
                <div className="site-list">
                  {results.map((site) => (
                    <div
                      key={site.site_id}
                      className={`site-item ${selectedSite?.site_id === site.site_id ? 'selected' : ''}`}
                      onMouseEnter={() => setHoveredSite(site.site_id)}
                      onMouseLeave={() => setHoveredSite(null)}
                      onClick={() => setSelectedSite(site)}
                    >
                      <div className="site-item-name">
                        #{site.localRank} - {site.site_id}
                      </div>
                      <div className="site-item-address">
                        {site.address}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Site Details Modal ── */}
      {selectedSite && mode === 'recommendation' && (
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

              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  <strong>Address:</strong> {selectedSite.address}
                </p>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  <strong>Coordinates:</strong> {selectedSite.latitude.toFixed(6)}, {selectedSite.longitude.toFixed(6)}
                </p>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  <strong>Local Rank:</strong> <span title="Your ranking within search results - lower is better (1 = best site in your search area)">#{selectedSite.localRank} of {results.length}</span>
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <h4 style={{ color: '#1a5276', marginBottom: '12px', fontSize: '16px' }}>
                    Location Factors
                  </h4>
                  <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Population Density:</td>
                        <td style={{ padding: '8px 0' }} title="How many people live nearby - higher means more potential patients to serve (0-1 scale)">{selectedSite.building_density_norm.toFixed(4)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Road Access:</td>
                        <td style={{ padding: '8px 0' }} title="How easy to reach by road - higher means better accessibility for ambulances and patients (0-1 scale)">{selectedSite.road_accessibility_norm.toFixed(4)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Facility Distance:</td>
                        <td style={{ padding: '8px 0' }} title="Distance to nearest health facility - lower means closer to existing services, may indicate overlap (0-1 scale)">{selectedSite.facility_distance_norm.toFixed(4)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 style={{ color: '#1a5276', marginBottom: '12px', fontSize: '16px' }}>
                    Suitability Comparison
                  </h4>
                  <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}></th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }} title="Analysis based only on location factors">No Hazard</th>
                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }} title="Analysis including natural disaster risks">With Hazard</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>Score:</td>
                        <td style={{ padding: '8px', fontSize: '15px', fontWeight: 'bold' }} title="Overall suitability score (0-1) - higher is better, considers population, roads, and facilities">{selectedSite.pred_score_A.toFixed(4)}</td>
                        <td style={{ padding: '8px', fontSize: '15px', fontWeight: 'bold' }} title="Overall suitability score (0-1) - higher is better, includes penalties for flood, landslide, and storm surge risks">{selectedSite.pred_score_B.toFixed(4)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>Class:</td>
                        <td style={{ padding: '8px', color: getColor(selectedSite.class_A), fontWeight: 'bold' }} title="Suitability rating: High (best), Moderate, Low, or Very Low">{selectedSite.class_A}</td>
                        <td style={{ padding: '8px', color: getColor(selectedSite.class_B), fontWeight: 'bold' }} title="Suitability rating: High (best), Moderate, Low, or Very Low">{selectedSite.class_B}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>Global Rank:</td>
                        <td style={{ padding: '8px' }} title="Ranking among all {sites.length} sites in Talomo District - lower number is better (1 = best)">{selectedSite.rank_A} / {sites.length}</td>
                        <td style={{ padding: '8px' }} title="Ranking among all {sites.length} sites in Talomo District - lower number is better (1 = best)">{selectedSite.rank_B} / {sites.length}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>Recommendation:</td>
                        <td style={{ padding: '8px', color: getRecommendationColor(selectedSite.rec_level_A), fontWeight: 'bold' }} title="Overall recommendation: Highly Suitable (best), Moderately Suitable, Conditionally Suitable, or Not Suitable">
                          {selectedSite.rec_label_A}
                        </td>
                        <td style={{ padding: '8px', color: getRecommendationColor(selectedSite.rec_level_B), fontWeight: 'bold' }} title="Overall recommendation: Highly Suitable (best), Moderately Suitable, Conditionally Suitable, or Not Suitable">
                          {selectedSite.rec_label_B}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <h4 style={{ color: '#1a5276', marginTop: '20px', marginBottom: '12px', fontSize: '16px' }}>
                    Natural Hazard Risks
                  </h4>
                  <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Flood Risk:</td>
                        <td style={{ padding: '8px 0' }} title="Risk of flooding during heavy rains or typhoons - higher values mean greater risk (0-1 scale)">
                          {selectedSite.flood_norm.toFixed(4)}
                          <span style={{ marginLeft: '8px', color: selectedSite.flood_norm > 0.5 ? '#d73027' : '#1a9850' }}>
                            ({selectedSite.flood_norm > 0.5 ? 'High' : 'Low'})
                          </span>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Landslide Risk:</td>
                        <td style={{ padding: '8px 0' }} title="Risk of landslides or soil movement, especially on slopes - higher values mean greater risk (0-1 scale)">
                          {selectedSite.landslide_norm.toFixed(4)}
                          <span style={{ marginLeft: '8px', color: selectedSite.landslide_norm > 0.5 ? '#d73027' : '#1a9850' }}>
                            ({selectedSite.landslide_norm > 0.5 ? 'High' : 'Low'})
                          </span>
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Storm Surge Risk:</td>
                        <td style={{ padding: '8px 0' }} title="Risk of coastal flooding from typhoons and high tides - higher values mean greater risk (0-1 scale)">
                          {selectedSite.stormsurge_norm.toFixed(4)}
                          <span style={{ marginLeft: '8px', color: selectedSite.stormsurge_norm > 0.5 ? '#d73027' : '#1a9850' }}>
                            ({selectedSite.stormsurge_norm > 0.5 ? 'High' : 'Low'})
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Evaluation Result ── */}
      {mode === 'evaluation' && evalResult && (
        <div className="results">
          <h3 title="Assessment of how suitable this specific location is for a health facility">
            Location Suitability Evaluation
          </h3>
          <div className="eval-card">
            <h4>📍 Location: {evalResult.lat.toFixed(6)}, {evalResult.lon.toFixed(6)}</h4>
            
            {evalResult.outsideCoverage && (
              <div style={{ 
                marginBottom: '15px', 
                padding: '12px', 
                backgroundColor: '#fff3cd', 
                borderRadius: '6px',
                borderLeft: '4px solid #ffc107'
              }}>
                ⚠️ <strong>Note:</strong> This location is {evalResult.distance.toFixed(2)}km from the nearest analyzed site. 
                Results are based on the closest available data point.
              </div>
            )}
            
            <h4 title="Overall scores indicating how suitable this location is (0-1 scale, higher is better)">
              Suitability Scores
            </h4>
            <table>
              <thead>
                <tr>
                  <th></th>
                  {config === 'modelA' && (
                    <th title="Analysis based only on location factors like population, road access, and distance to facilities">
                      No Hazard
                    </th>
                  )}
                  {config === 'modelB' && (
                    <th title="Analysis that includes natural hazard risks (floods, landslides, storm surge)">
                      With Hazard
                    </th>
                  )}
                  {config === 'both' && (
                    <>
                      <th title="Analysis based only on location factors like population, road access, and distance to facilities">
                        No Hazard
                      </th>
                      <th title="Analysis that includes natural hazard risks (floods, landslides, storm surge)">
                        With Hazard
                      </th>
                      <th title="Difference between No Hazard and With Hazard">
                        Difference
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Suitability Score</strong></td>
                  {config === 'modelA' && (
                    <td style={{ fontSize: '1.2em', fontWeight: 'bold' }} title="Neural network output: weighted combination of population, road access, and facility distance">{evalResult.scoreA.toFixed(4)}</td>
                  )}
                  {config === 'modelB' && (
                    <td style={{ fontSize: '1.2em', fontWeight: 'bold' }} title="Neural network output: weighted combination of location factors + hazard penalties (flood, landslide, storm surge)">{evalResult.scoreB.toFixed(4)}</td>
                  )}
                  {config === 'both' && (
                    <>
                      <td style={{ fontSize: '1.2em', fontWeight: 'bold' }} title="Neural network output: weighted combination of population, road access, and facility distance">{evalResult.scoreA.toFixed(4)}</td>
                      <td style={{ fontSize: '1.2em', fontWeight: 'bold' }} title="Neural network output: weighted combination of location factors + hazard penalties (flood, landslide, storm surge)">{evalResult.scoreB.toFixed(4)}</td>
                      <td style={{ fontSize: '1.2em', fontWeight: 'bold' }} title="Score difference: No Hazard - With Hazard">{(evalResult.scoreA - evalResult.scoreB).toFixed(4)}</td>
                    </>
                  )}
                </tr>
                <tr>
                  <td title="Overall rating from Very Low to High">
                    <strong>Suitability Level</strong>
                  </td>
                  {config === 'modelA' && (
                    <td style={{ color: getColor(evalResult.classA), fontWeight: 'bold' }} title="Classification based on score thresholds: High (≥0.60), Moderate (≥0.40), Low (≥0.25), Very Low (<0.25)">{evalResult.classA}</td>
                  )}
                  {config === 'modelB' && (
                    <td style={{ color: getColor(evalResult.classB), fontWeight: 'bold' }} title="Classification based on score thresholds: High (≥0.60), Moderate (≥0.40), Low (≥0.25), Very Low (<0.25)">{evalResult.classB}</td>
                  )}
                  {config === 'both' && (
                    <>
                      <td style={{ color: getColor(evalResult.classA), fontWeight: 'bold' }} title="Classification based on score thresholds: High (≥0.60), Moderate (≥0.40), Low (≥0.25), Very Low (<0.25)">{evalResult.classA}</td>
                      <td style={{ color: getColor(evalResult.classB), fontWeight: 'bold' }} title="Classification based on score thresholds: High (≥0.60), Moderate (≥0.40), Low (≥0.25), Very Low (<0.25)">{evalResult.classB}</td>
                      <td title="Level change when hazards are considered">{evalResult.classA !== evalResult.classB ? `${evalResult.classA} → ${evalResult.classB}` : 'No change'}</td>
                    </>
                  )}
                </tr>
                <tr>
                  <td title="How this location ranks compared to all analyzed sites in Talomo">
                    <strong>Overall Rank</strong>
                  </td>
                  {config === 'modelA' && (
                    <td title="Ranking among all {sites.length} analyzed sites, sorted by score (1 = highest)">#{evalResult.rankA} of {sites.length}</td>
                  )}
                  {config === 'modelB' && (
                    <td title="Ranking among all {sites.length} analyzed sites, sorted by score (1 = highest)">#{evalResult.rankB} of {sites.length}</td>
                  )}
                  {config === 'both' && (
                    <>
                      <td title="Ranking among all {sites.length} analyzed sites, sorted by score (1 = highest)">#{evalResult.rankA} of {sites.length}</td>
                      <td title="Ranking among all {sites.length} analyzed sites, sorted by score (1 = highest)">#{evalResult.rankB} of {sites.length}</td>
                      <td title="Rank difference: No Hazard - With Hazard">{evalResult.rankA - evalResult.rankB}</td>
                    </>
                  )}
                </tr>
                <tr>
                  <td title="Level 3 = Highly recommended, Level 2 = Moderately suitable, Level 1 = Conditionally suitable">
                    <strong>Recommendation</strong>
                  </td>
                  {config === 'modelA' && (
                    <td style={{ 
                      color: getRecommendationColor(evalResult.levelA), 
                      fontWeight: 'bold',
                      fontSize: '1.1em'
                    }} title="Level based on score: Highly Suitable (≥0.6), Moderately Suitable (≥0.4), Conditionally Suitable (≥0.2), Not Suitable (<0.2)">
                      {evalResult.site.rec_label_A}
                    </td>
                  )}
                  {config === 'modelB' && (
                    <td style={{ 
                      color: getRecommendationColor(evalResult.levelB), 
                      fontWeight: 'bold',
                      fontSize: '1.1em'
                    }} title="Level based on score: Highly Suitable (≥0.6), Moderately Suitable (≥0.4), Conditionally Suitable (≥0.2), Not Suitable (<0.2)">
                      {evalResult.site.rec_label_B}
                    </td>
                  )}
                  {config === 'both' && (
                    <>
                      <td style={{ 
                        color: getRecommendationColor(evalResult.levelA), 
                        fontWeight: 'bold',
                        fontSize: '1.1em'
                      }} title="Level based on score: Highly Suitable (≥0.6), Moderately Suitable (≥0.4), Conditionally Suitable (≥0.2), Not Suitable (<0.2)">
                        {evalResult.site.rec_label_A}
                      </td>
                      <td style={{ 
                        color: getRecommendationColor(evalResult.levelB), 
                        fontWeight: 'bold',
                        fontSize: '1.1em'
                      }} title="Level based on score: Highly Suitable (≥0.6), Moderately Suitable (≥0.4), Conditionally Suitable (≥0.2), Not Suitable (<0.2)">
                        {evalResult.site.rec_label_B}
                      </td>
                      <td title="Recommendation level difference">{evalResult.levelA - evalResult.levelB}</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>

            {config === 'both' && evalResult.classA !== evalResult.classB && (
              <p className="warning" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                ⚠️ <strong>Note:</strong> Suitability level changes from <strong>{evalResult.classA}</strong> to{' '}
                <strong>{evalResult.classB}</strong> when natural hazards are considered.
              </p>
            )}
            
            <h4 style={{ marginTop: '20px' }} title="Characteristics of this location that affect its suitability (values are normalized 0-1)">
              Location Factors
            </h4>
            <table>
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Value</th>
                  <th>What This Means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td title="How many people live in this area">
                    <strong>Population Density</strong>
                  </td>
                  <td title="Normalized building count per area: (building_count - min) / (max - min)">{evalResult.factors.buildingDensity.toFixed(4)}</td>
                  <td>{evalResult.factors.buildingDensity > 0.5 ? 'High population - more people to serve' : 'Lower population - fewer potential patients'}</td>
                </tr>
                <tr>
                  <td title="How easy it is to reach this location by road">
                    <strong>Road Access</strong>
                  </td>
                  <td title="Normalized proximity to roads: (distance_to_road - min) / (max - min), inverted so closer = higher">{evalResult.factors.roadAccessibility.toFixed(4)}</td>
                  <td>{evalResult.factors.roadAccessibility > 0.5 ? 'Good road access - easy to reach' : 'Limited road access - may be harder to reach'}</td>
                </tr>
                <tr>
                  <td title="How far this is from the nearest healthcare facility">
                    <strong>Distance to Existing Facility</strong>
                  </td>
                  <td title="Normalized distance to nearest facility: (distance - min) / (max - min)">{evalResult.factors.facilityDistance.toFixed(4)}</td>
                  <td>{evalResult.factors.facilityDistance > 0.5 ? 'Far from existing facilities - may fill a gap' : 'Close to existing facilities - may have overlap'}</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ marginTop: '20px' }} title="Risk levels for natural disasters that could affect this location (values are normalized 0-1)">
              Natural Hazard Risks
            </h4>
            <table>
              <thead>
                <tr>
                  <th>Hazard Type</th>
                  <th>Risk Value</th>
                  <th>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td title="Risk of flooding during heavy rains or typhoons">
                    <strong>Flood Risk</strong>
                  </td>
                  <td title="Normalized flood susceptibility: (flood_level - min) / (max - min) from hazard maps">{evalResult.factors.flood.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.flood > 0.5 ? '#d73027' : '#1a9850', fontWeight: 'bold' }}>
                    {evalResult.factors.flood > 0.5 ? 'High Risk' : 'Low Risk'}
                  </td>
                </tr>
                <tr>
                  <td title="Risk of landslides or soil movement">
                    <strong>Landslide Risk</strong>
                  </td>
                  <td title="Normalized landslide susceptibility: (landslide_level - min) / (max - min) from hazard maps">{evalResult.factors.landslide.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.landslide > 0.5 ? '#d73027' : '#1a9850', fontWeight: 'bold' }}>
                    {evalResult.factors.landslide > 0.5 ? 'High Risk' : 'Low Risk'}
                  </td>
                </tr>
                <tr>
                  <td title="Risk of coastal flooding from typhoons">
                    <strong>Storm Surge Risk</strong>
                  </td>
                  <td title="Normalized storm surge susceptibility: (surge_level - min) / (max - min) from hazard maps">{evalResult.factors.stormsurge.toFixed(4)}</td>
                  <td style={{ color: evalResult.factors.stormsurge > 0.5 ? '#d73027' : '#1a9850', fontWeight: 'bold' }}>
                    {evalResult.factors.stormsurge > 0.5 ? 'High Risk' : 'Low Risk'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ 
              fontSize: '0.9em', 
              color: '#666', 
              marginTop: '15px', 
              padding: '12px', 
              backgroundColor: '#e3f2fd', 
              borderRadius: '6px',
              borderLeft: '4px solid #2196f3'
            }}>
              ℹ️ <strong>About the data:</strong> All scores and factors shown here were pre-computed by the analysis model 
              and are based on actual GIS data for Talomo District, including population census, road networks, 
              existing healthcare facilities, and hazard maps.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}