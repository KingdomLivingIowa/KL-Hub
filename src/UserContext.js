import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const UserContext = createContext(null);

export function UserProvider({ user, children }) {
  const [role, setRole] = useState(null);
  const [assignedHouseIds, setAssignedHouseIds] = useState([]);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchRoleAndAssignments();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRoleAndAssignments = async () => {
    setLoadingRole(true);

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile) {
      setRole(profile.role);

      // Only fetch house assignments for house manager roles
      if (profile.role === 'house_manager' || profile.role === 'head_house_manager') {
        const { data: assignments } = await supabase
          .from('user_house_assignments')
          .select('house_id')
          .eq('user_id', user.id);
        setAssignedHouseIds((assignments || []).map(a => a.house_id));
      }
    }

    setLoadingRole(false);
  };

  const isAdmin = role === 'admin';
  const isUpperManagement = role === 'upper_management';
  const isHeadHouseManager = role === 'head_house_manager';
  const isHouseManager = role === 'house_manager';

  // Full access roles
  const hasFullAccess = isAdmin || isUpperManagement;

  // House manager roles (restricted to assigned houses)
  const isHouseManagerRole = isHouseManager || isHeadHouseManager;

  // What modules they can see
  const canSeeAdmissions = hasFullAccess;
  const canSeeWaitingList = hasFullAccess;
  const canSeeIntake = hasFullAccess;
  const canSeeReports = hasFullAccess;
  const canSeeUserManagement = isAdmin;
  const canSeeHouses = true; // all roles
  const canSeeClients = true; // all roles, but filtered for house managers

  return (
    <UserContext.Provider value={{
      role,
      loadingRole,
      assignedHouseIds,
      user,
      isAdmin,
      isUpperManagement,
      isHeadHouseManager,
      isHouseManager,
      hasFullAccess,
      isHouseManagerRole,
      canSeeAdmissions,
      canSeeWaitingList,
      canSeeIntake,
      canSeeReports,
      canSeeUserManagement,
      canSeeHouses,
      canSeeClients,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}