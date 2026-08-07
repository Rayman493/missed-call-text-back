// Google Maps type declarations
declare global {
  interface Window {
    google: typeof google
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions)
      setCenter(latlng: LatLng | LatLngLiteral): void
      getCenter(): LatLng
      setZoom(zoom: number): void
      getZoom(): number
      fitBounds(bounds: LatLngBounds | LatLngBoundsLiteral): void
      panTo(latlng: LatLng | LatLngLiteral): void
      panBy(x: number, y: number): void
      setMapTypeId(mapTypeId: MapTypeId): void
      getMapTypeId(): MapTypeId
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral
      zoom?: number
      mapTypeId?: MapTypeId | string
      disableDefaultUI?: boolean
      zoomControl?: boolean
      mapTypeControl?: boolean
      streetViewControl?: boolean
      fullscreenControl?: boolean
      styles?: MapTypeStyle[]
    }

    interface LatLng {
      lat(): number
      lng(): number
      equals(other: LatLng): boolean
      toUrlValue(precision?: number): string
    }

    interface LatLngLiteral {
      lat: number
      lng: number
    }

    class LatLng {
      constructor(lat: number, lng: number, noWrap?: boolean)
    }

    class LatLngBounds {
      constructor(sw?: LatLng | LatLngLiteral, ne?: LatLng | LatLngLiteral)
      extend(point: LatLng | LatLngLiteral): void
      contains(point: LatLng | LatLngLiteral): boolean
      getCenter(): LatLng
    }

    interface LatLngBoundsLiteral {
      south: number
      west: number
      north: number
      east: number
    }

    enum MapTypeId {
      ROADMAP,
      SATELLITE,
      HYBRID,
      TERRAIN
    }

    class Marker {
      constructor(opts?: MarkerOptions)
      setMap(map: Map | null): void
      getMap(): Map | null
      setPosition(position: LatLng | LatLngLiteral): void
      getPosition(): LatLng | null
      setTitle(title: string | null): void
      getTitle(): string | null
      setIcon(icon: string | Icon | Symbol): void
      getIcon(): string | Icon | Symbol | null
      setAnimation(animation: Animation | null): void
      getAnimation(): Animation | null
      setClickable(flag: boolean): void
      getClickable(): boolean
      setCursor(cursor: string): void
      getCursor(): string
      setDraggable(flag: boolean): void
      getDraggable(): boolean
      setVisible(visible: boolean): void
      getVisible(): boolean
      setZIndex(zIndex: number): void
      getZIndex(): number
      addListener(eventName: string, handler: Function): MapsEventListener
    }

    interface MarkerOptions {
      position?: LatLng | LatLngLiteral
      map?: Map | null
      title?: string | null
      icon?: string | Icon | Symbol | null
      animation?: Animation | null
      clickable?: boolean
      cursor?: string
      draggable?: boolean
      visible?: boolean
      zIndex?: number
    }

    interface Icon {
      url: string
      size?: Size
      origin?: Point
      anchor?: Point
      scaledSize?: Size
    }

    interface Symbol {
      path: SymbolPath
      anchor?: Point
      fillColor?: string
      fillOpacity?: number
      rotation?: number
      scale?: number
      strokeColor?: string
      strokeOpacity?: number
      strokeWeight?: number
    }

    enum SymbolPath {
      CIRCLE,
      BACKWARD_CLOSED_ARROW,
      BACKWARD_OPEN_ARROW,
      FORWARD_CLOSED_ARROW,
      FORWARD_OPEN_ARROW
    }

    class Point {
      constructor(x: number, y: number)
    }

    class Size {
      constructor(width: number, height: number, widthUnit?: string, heightUnit?: string)
    }

    enum Animation {
      BOUNCE,
      DROP
    }

    interface MapsEventListener {
      remove(): void
    }
  }
}

export {}
