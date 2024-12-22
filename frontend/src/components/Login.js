import React from 'react';

function Login() {
  return (
    <div className="login-page">
      <h1>GitHub Stars Manager</h1>
      <p>Manage your GitHub stars with custom tags</p>
      <a 
        href="/auth/github"
        className="github-login-button"
      >
        Login with GitHub
      </a>
    </div>
  );
}

export default Login; 