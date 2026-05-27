alter table capture_client_events
  add constraint capture_client_events_event_type_check
  check (event_type in ('hosted_capture_waiting')) not valid;

alter table capture_client_events
  add constraint capture_client_events_phase_check
  check (
    phase is null or phase in (
      'enqueue_capture',
      'enqueue_capture_multipart',
      'poll_capture',
      'trigger_analyze',
      'refresh_auth_session',
      'unknown'
    )
  ) not valid;

alter table capture_client_events
  add constraint capture_client_events_reason_code_check
  check (
    reason_code in (
      'dns_resolution_failed',
      'request_timeout',
      'connection_refused',
      'no_route_to_host',
      'connection_reset',
      'connection_aborted',
      'unexpected_end_of_stream',
      'unknown_network_error'
    )
  ) not valid;

alter table capture_client_events
  add constraint capture_client_events_message_size_check
  check (octet_length(coalesce(message, '')) <= 500) not valid;

alter table capture_client_events
  add constraint capture_client_events_diagnostics_size_check
  check (pg_column_size(diagnostics) <= 8192) not valid;

create index if not exists capture_client_events_reason_created_idx
  on capture_client_events(reason_code, created_at desc);
