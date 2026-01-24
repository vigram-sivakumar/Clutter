/**
 * Error fallback UI for EditorCore
 * Displays when the editor crashes to prevent loss of user data
 */

import React from 'react';
import type { FallbackProps } from 'react-error-boundary';

export const EditorErrorFallback: React.FC<FallbackProps> = ({
  error,
  resetErrorBoundary,
}) => {
  return (
    <div
      style={{
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        backgroundColor: '#fafaf8',
        border: '1px solid #ecece6',
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          fontSize: '48px',
          marginBottom: '16px',
        }}
      >
        ⚠️
      </div>

      <h2
        style={{
          fontSize: '20px',
          fontWeight: 600,
          marginBottom: '8px',
          color: '#131210',
        }}
      >
        Editor Error
      </h2>

      <p
        style={{
          fontSize: '14px',
          color: '#5c5b52',
          marginBottom: '24px',
          textAlign: 'center',
          maxWidth: '400px',
        }}
      >
        The editor encountered an error. Your content is safe and has been preserved.
      </p>

      {error && (
        <details
          style={{
            marginBottom: '24px',
            maxWidth: '500px',
            width: '100%',
          }}
        >
          <summary
            style={{
              fontSize: '13px',
              color: '#8a8980',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            Error details
          </summary>
          <pre
            style={{
              fontSize: '12px',
              color: '#5c5b52',
              backgroundColor: '#f5f5f0',
              padding: '12px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '200px',
            }}
          >
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </details>
      )}

      <button
        onClick={resetErrorBoundary}
        style={{
          backgroundColor: '#26251f',
          color: '#ffffff',
          padding: '10px 20px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#2f2e28';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#26251f';
        }}
      >
        Reload Editor
      </button>

      <p
        style={{
          fontSize: '12px',
          color: '#8a8980',
          marginTop: '16px',
        }}
      >
        If this problem persists, please report it
      </p>
    </div>
  );
};
