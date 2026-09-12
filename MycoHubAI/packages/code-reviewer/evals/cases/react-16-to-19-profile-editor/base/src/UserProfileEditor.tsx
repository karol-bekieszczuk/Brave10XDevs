import React from "react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

interface UserProfileEditorProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onReconnect: () => void;
}

type EditorDraft = Partial<Pick<UserProfile, "name" | "email">>;

export class UserProfileEditor extends React.Component<UserProfileEditorProps, EditorDraft & { isOnline: boolean }> {
  state = {
    name: this.props.profile.name,
    email: this.props.profile.email,
    isOnline: false,
  };

  componentDidMount() {
    window.addEventListener("online", this.handleOnline);
  }

  componentDidUpdate(previousProps: UserProfileEditorProps) {
    if (previousProps.profile !== this.props.profile) {
      this.setState({
        name: this.props.profile.name,
        email: this.props.profile.email,
      });
    }
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.handleOnline);
  }

  private handleOnline = () => {
    this.setState({ isOnline: true });
    this.props.onReconnect();
  };

  private handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    this.props.onSave({
      ...this.props.profile,
      name: this.state.name ?? "",
      email: this.state.email ?? "",
    });
  };

  render() {
    return (
      <form aria-label="Profile editor" onSubmit={this.handleSubmit}>
        <label htmlFor="profile-name">Name</label>
        <input
          id="profile-name"
          value={this.state.name ?? ""}
          onChange={(event) => this.setState({ name: event.currentTarget.value })}
        />

        <label htmlFor="profile-email">Email</label>
        <input
          id="profile-email"
          type="email"
          value={this.state.email ?? ""}
          onChange={(event) => this.setState({ email: event.currentTarget.value })}
        />

        <p role="status">{this.state.isOnline ? "Online" : "Waiting for connection"}</p>
        <button type="submit">Save profile</button>
      </form>
    );
  }
}
