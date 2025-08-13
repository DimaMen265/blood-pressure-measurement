import React from 'react';
import { BloodPressureMeasurement } from './components/BloodPressureMeasurement';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-500 p-6">
      <div>
        <BloodPressureMeasurement />
      </div>
    </div>
  );
};
