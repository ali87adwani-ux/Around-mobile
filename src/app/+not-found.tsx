import { Redirect } from 'expo-router';

// Unknown paths (e.g. when the web build is hosted under a sub-path) go to the home screen.
export default function NotFound() {
  return <Redirect href="/" />;
}
