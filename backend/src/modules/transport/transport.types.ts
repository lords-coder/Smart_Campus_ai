export type VehicleType = "BUS" | "MINIBUS" | "VAN";
export type VehicleStatus = "ACTIVE" | "MAINTENANCE" | "INACTIVE";
export type AssignmentStatus = "ACTIVE" | "ENDED";
export type PassStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface TransportDriver {
  id: string;
  name: string;
  phone: string;
  licenseNo: string;
  active: boolean;
}

export interface TransportVehicle {
  id: string;
  registrationNumber: string;
  vehicleType: VehicleType;
  capacity: number;
  status: VehicleStatus;
  driverId: string | null;
  driverName: string | null;
  assignedStudents: number;
}

export interface TransportStop {
  id: string;
  routeId: string;
  name: string;
  sequence: number;
  scheduledTime: string;
  active: boolean;
}

export interface TransportRoute {
  id: string;
  routeCode: string;
  name: string;
  active: boolean;
  stopCount: number;
  assignedStudents: number;
  vehicleId: string | null;
  vehicleNumber: string | null;
}

export interface TransportAssignment {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  routeId: string;
  routeCode?: string;
  routeName?: string;
  stopId: string;
  stopName?: string;
  scheduledTime?: string;
  vehicleId: string | null;
  vehicleNumber?: string | null;
  passNumber?: string | null;
  passStatus?: string | null;
  startDate: string;
  endDate: string | null;
  status: AssignmentStatus;
}

export interface TransportPass {
  id: string;
  studentId: string;
  assignmentId: string;
  passNumber: string;
  validFrom: string;
  validUntil: string;
  status: PassStatus;
}

export interface TransportAlert {
  id: string;
  routeId: string;
  routeCode?: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  active: boolean;
  createdAt: string;
}

export type TrackingStatus = "MOVING" | "IDLE" | "OFFLINE";
export type TelemetrySource = "MANUAL" | "SIMULATED" | "DEVICE";

export interface VehicleTracking {
  vehicleId: string;
  registrationNumber: string;
  vehicleStatus: VehicleStatus;
  trackingStatus: TrackingStatus;
  simulated: boolean;
  lastUpdateAt: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  route: { id: string; routeCode: string; name: string } | null;
  currentStop: { id: string; name: string; sequence: number } | null;
  nextStop: { id: string; name: string; sequence: number; scheduledTime: string } | null;
  progressPct: number | null;
}

export interface MyTransport {
  assignment: {
    id: string;
    route: { id: string; routeCode: string; name: string };
    stop: { id: string; name: string; scheduledTime: string };
    vehicle: { id: string; registrationNumber: string; vehicleType: string; status: string; driverName: string | null } | null;
    startDate: string;
    allStops: Array<{ name: string; sequence: number; scheduledTime: string }>;
  } | null;
  pass: {
    passNumber: string;
    validFrom: string;
    validUntil: string;
    status: PassStatus;
    transportFeeStatus: string | null;
  } | null;
  alerts: Array<{ title: string; detail: string; severity: AlertSeverity }>;
  tracking: VehicleTracking | null;
}
