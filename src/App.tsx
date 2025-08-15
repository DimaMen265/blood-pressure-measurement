import React from 'react';
import { BloodPressureMeasurement } from './components/BloodPressureMeasurement';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-white p-6">
      <div>
        <BloodPressureMeasurement />
      </div>
    </div>
  );
};
