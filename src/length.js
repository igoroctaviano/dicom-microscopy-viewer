import 'ol/ol.css';
import Overlay from 'ol/Overlay';
import { LineString } from 'ol/geom';
import { getLength } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import { default as LineStringGeometry } from 'ol/geom/LineString';
import { default as PointGeometry } from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import DragPan from 'ol/interaction/DragPan';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Collection from 'ol/Collection';

const CustomGeometry = {
  Length: 'Length',
  Arrow: 'Arrow',
  FreeText: 'FreeText'
};

/**
 * Format length output.
 * @param {LineString} line The line.
 * @return {string} The formatted length.
 */
export const formatLength = line => {
  const length = getLength(line);
  let output = Math.round((length / 10) * 100) / 100 + ' ' + 'mm';
  return output;
};

const listeners = {};
const measureMarkers = {};
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  .ol-tooltip {
    color: #9ccef9;
    padding: 4px 8px;
    white-space: nowrap;
    font-size: 14px;
    position: absolute;
  }
  .ol-tooltip-measure { opacity: 1; }
  .ol-tooltip-static { color: #9ccef9; }
  .ol-tooltip-measure:before,
  .ol-tooltip-static:before {
    content: '',
  }

  #marker { cursor: move; }
  .marker-container { display: block !important; }
`;

const stylesOverlay = new Overlay({ element: styleTag });

const createMeasureMarker = (feature, map) => {
  const featureId = feature.ol_uid;

  if (!measureMarkers[featureId]) {
    measureMarkers[featureId] = {};

    const markerElement = document.createElement("div");
    markerElement.id = 'marker';
    markerElement.className = 'ol-tooltip ol-tooltip-measure';
    markerElement.innerHTML = '';

    measureMarkers[featureId].element = markerElement;
    measureMarkers[featureId].overlay = new Overlay({
      positioning: 'center-center',
      element: markerElement,
      className: 'marker-container',
      stopEvent: false,
      dragging: false
    });

    let dragPan;
    map.getInteractions().forEach(interaction => {
      if (interaction instanceof DragPan) {
        dragPan = interaction;
      }
    });

    markerElement.addEventListener('mousedown', () => {
      const marker = measureMarkers[featureId];
      if (marker) {
        dragPan.setActive(false);
        marker.overlay.set('dragging', true);
      }
    });

    map.on('pointermove', event => {
      const marker = measureMarkers[featureId];
      if (marker && marker.overlay.get('dragging') === true) {
        marker.overlay.setPosition(event.coordinate);
        drawLink({
          id: featureId,
          map,
          tooltipCoord: event.coordinate,
          closestPointToFeature: feature.getGeometry().getClosestPoint(feature.getGeometry().getCoordinates()[1])
        });
      }
    });

    map.on('pointerup', () => {
      const marker = measureMarkers[featureId];
      if (marker && marker.overlay.get('dragging') === true) {
        dragPan.setActive(true);
        marker.overlay.set('dragging', false);
      }
    });

    map.addOverlay(measureMarkers[featureId].overlay);
  }
};

const updateMeasurementTooltipLocation = evt => {
  evt.features.forEach(feature => {
    const sketch = feature;
    const featureId = sketch.ol_uid;
    if (measureMarkers[featureId]) {
      let tooltipCoord = evt.coordinate;
      const gem = sketch.getGeometry();
      if (gem instanceof LineStringGeometry) {
        listeners[featureId] = gem.on('change', evt => {
          let geom = evt.target;
          let output = formatLength(geom);
          tooltipCoord = geom.getLastCoordinate();
          measureMarkers[featureId].element.innerHTML = output;
          measureMarkers[featureId].overlay.setPosition(tooltipCoord);
        });
      }
    }
  });
};

const onDrawStart = event => {
  const featureId = event.feature.ol_uid;
  createMeasureMarker(event.feature, map);
  const sketch = event.feature;
  let tooltipCoord = event.coordinate;
  listeners[featureId] = sketch.getGeometry().on('change', event => {
    let geom = event.target;
    let output = formatLength(geom);
    tooltipCoord = geom.getLastCoordinate();
    measureMarkers[featureId].element.innerHTML = output;
    measureMarkers[featureId].overlay.setPosition(tooltipCoord);
    drawLink({
      id: featureId,
      map,
      tooltipCoord,
      closestPointToFeature: geom.getClosestPoint(geom.getCoordinates()[1])
    });
  });
};

const onDrawEnd = event => {
  const featureId = event.feature.ol_uid;
  if (measureMarkers[featureId]) {
    measureMarkers[featureId].element.className = 'ol-tooltip ol-tooltip-static';
    measureMarkers[featureId].overlay.setOffset([0, -7]);
    unByKey(listeners[featureId]);
  }
};

const eventKeys = {};

const unbindEvent = eventKey => {
  if (eventKeys[eventKey]) {
    unByKey(eventKeys[eventKey]);
    eventKeys[eventKey] = null;
  }
};

export const hasLength = features => features.getArray().some(feature => {
  return [CustomGeometry.Length].includes(feature.getGeometryName());
});

const linkFeatures = new Collection([], { unique: true });
const linkStyle = new Style({
  stroke: new Stroke({
    color: '#ffcc33',
    lineDash: [.3, 7],
    width: 3
  })
});
const linksSource = new VectorSource({ features: linkFeatures });
const linksVector = new VectorLayer({
  source: linksSource,
  style: [linkStyle]
});

export const addDrawLinksLayer = ({ map }) => map.addLayer(linksVector);

export const drawLink = ({ id, map, tooltipCoord, closestPointToFeature }) => {
  const coords = [
    tooltipCoord ? tooltipCoord : [-96.36, 30.75],
    closestPointToFeature ? closestPointToFeature : [-96.36, 30.75]
  ];

  const lineString = new LineStringGeometry(coords);

  const updated = linkFeatures.getArray().some(feature => {
    if (feature.getId() === id) {
      feature.setGeometry(lineString);
      return true;
    }
  });

  if (!updated) {
    const featureLink = new Feature({ geometry: lineString, name: 'Line' });
    featureLink.setId(id);
    linkFeatures.push(featureLink);
  }
};

const LengthGeometry = {
  init: ({ map }) => {
    map.addOverlay(stylesOverlay);
    drawLink({ map });
    addDrawLinksLayer({ map });
  },
  wireEvents: interactions => {
    if (interactions.draw) {
      unbindEvent('drawstart');
      unbindEvent('drawend');
      eventKeys['drawstart'] = interactions.draw.on('drawstart', onDrawStart);
      eventKeys['drawend'] = interactions.draw.on('drawend', onDrawEnd);
    }

    if (interactions.translate) {
      unbindEvent('translatestart');
      eventKeys['translatestart'] = interactions.translate.on(
        'translatestart',
        updateMeasurementTooltipLocation
      );
    }

    if (interactions.modify) {
      unbindEvent('modifystart');
      eventKeys['modifystart'] = interactions.modify.on(
        'modifystart',
        updateMeasurementTooltipLocation
      );
    }
  },
  remove: ({ feature, map }) => {
    const featureId = feature.ol_uid;
    if (measureMarkers && measureMarkers[featureId]) {
      const { overlay } = measureMarkers[featureId];
      map.removeOverlay(overlay);
      measureMarkers[featureId] = null;
      listeners[featureId] = null;
    }

    const drawnLink = linkFeatures.getArray().find(feature => feature.getId() === featureId);
    if (drawnLink) {
      linkFeatures.remove(drawnLink);
    }
  }
};

export default LengthGeometry;