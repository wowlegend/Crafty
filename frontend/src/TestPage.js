import React, { useState } from 'react';

function TestPage() {
  const [count, setCount] = useState(0);

  return (
    <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center">
      <div className="text-white text-center">
        <h1 className="text-4xl font-bold mb-4">React Hooks Test</h1>
        <p className="text-xl mb-4">Count: {count}</p>
        <button 
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded"
          onClick={() => setCount(count + 1)}
        >
          Increment
        </button>
      </div>
    </div>
  );
}

export default TestPage;
