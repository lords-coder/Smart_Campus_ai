export type RoomType = "SINGLE" | "DOUBLE" | "TRIPLE" | "QUAD";
export type RoomStatus = "AVAILABLE" | "FULL" | "MAINTENANCE";
export type AllocationStatus = "ACTIVE" | "VACATED" | "PENDING";
export type ComplaintCategory = "ELECTRICAL" | "PLUMBING" | "CLEANING" | "FURNITURE" | "INTERNET" | "OTHER";
export type ComplaintStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ComplaintPriority = "LOW" | "MEDIUM" | "HIGH";
export type RoomChangeStatus = "PENDING" | "APPROVED" | "REJECTED";
export type VisitorStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

export interface HostelSummary {
  id: string;
  name: string;
  block: string;
  category: string;
  wardenName: string | null;
  active: boolean;
  roomCount: number;
  bedCapacity: number;
  occupiedBeds: number;
  occupancyPercentage: number;
}

export interface HostelRoom {
  id: string;
  hostelId: string;
  hostelName: string;
  roomNumber: string;
  floor: number;
  roomType: RoomType;
  capacity: number;
  status: RoomStatus;
  occupiedBeds: number;
  occupants: Array<{ studentId: string; studentNo: string; name: string; bedNumber: number }>;
}

export interface HostelAllocation {
  id: string;
  roomId: string;
  roomNumber: string;
  hostelId: string;
  hostelName: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  bedNumber: number;
  allocatedOn: string;
  vacatedOn: string | null;
  status: AllocationStatus;
}

export interface HostelFeeRecord {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

export interface MyHostel {
  allocation: {
    id: string;
    bedNumber: number;
    allocatedOn: string;
    room: { id: string; roomNumber: string; floor: number; roomType: RoomType; capacity: number };
    hostel: { id: string; name: string; block: string; wardenName: string | null };
  } | null;
  roommates: Array<{ studentNo: string; name: string; bedNumber: number }>;
  fees: HostelFeeRecord[];
}

export interface HostelComplaint {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  roomId: string | null;
  roomNumber?: string | null;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
}

export interface RoomChangeRequest {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  currentRoomId: string;
  currentRoomNumber?: string;
  requestedRoomId: string | null;
  requestedRoomNumber?: string | null;
  reason: string;
  status: RoomChangeStatus;
  createdAt: string;
}

export interface HostelVisitor {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  visitorName: string;
  relation: string;
  visitDate: string;
  visitTime: string | null;
  status: VisitorStatus;
  createdAt: string;
}
