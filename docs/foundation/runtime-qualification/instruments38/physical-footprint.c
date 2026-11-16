// Calibration utility only: never links into a Clutter app or reads a vault.
#if defined(__APPLE__)
#define _DARWIN_C_SOURCE 1
#endif
#include <stdio.h>
#include <string.h>
#if defined(__APPLE__)
#include <errno.h>
#include <inttypes.h>
#include <libproc.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>

#define ALLOCATION_BYTES (64ULL * 1024ULL * 1024ULL)
static int byte_io(int fd, char *value, int writing) {
    ssize_t count;
    do { count = writing ? write(fd, value, 1) : read(fd, value, 1); }
    while (count < 0 && errno == EINTR);
    return count == 1;
}
static int read_counter(pid_t pid, struct rusage_info_v4 *value) {
    memset(value, 0, sizeof(*value));
    return proc_pid_rusage(pid, RUSAGE_INFO_V4, (rusage_info_t *)value) == 0;
}
static void allocation_child(int commands, int replies) {
    // Parent execution timeout cannot leave this helper permanently waiting.
    alarm(15);
    char message = 'B';
    if (!byte_io(replies, &message, 1) || !byte_io(commands, &message, 0) || message != 'T') _exit(2);
    void *mapping = mmap(NULL, (size_t)ALLOCATION_BYTES, PROT_READ | PROT_WRITE,
                         MAP_PRIVATE | MAP_ANON, -1, 0);
    if (mapping == MAP_FAILED) _exit(3);
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) _exit(4);
    volatile unsigned char *memory = (volatile unsigned char *)mapping;
    for (size_t index = 0; index < (size_t)ALLOCATION_BYTES; index += (size_t)page)
        memory[index] = (unsigned char)(index / (size_t)page + 1);
    message = 'H';
    if (!byte_io(replies, &message, 1) || !byte_io(commands, &message, 0) || message != 'R') _exit(5);
    if (munmap(mapping, (size_t)ALLOCATION_BYTES) != 0) _exit(6);
    message = 'R';
    if (!byte_io(replies, &message, 1) || !byte_io(commands, &message, 0) || message != 'Q') _exit(7);
    _exit(0);
}
static int calibrate(void) {
    int commands[2], replies[2];
    if (pipe(commands) != 0) { puts("{\"status\":\"pipe-unavailable\"}"); return 2; }
    if (pipe(replies) != 0) { close(commands[0]); close(commands[1]); puts("{\"status\":\"pipe-unavailable\"}"); return 2; }
    signal(SIGPIPE, SIG_IGN);
    pid_t child = fork();
    if (child < 0) {
        close(commands[0]); close(commands[1]); close(replies[0]); close(replies[1]);
        puts("{\"status\":\"fork-unavailable\"}"); return 2;
    }
    if (child == 0) {
        close(commands[1]); close(replies[0]);
        allocation_child(commands[0], replies[1]);
    }
    close(commands[0]); close(replies[1]);
    struct rusage_info_v4 before, held, released;
    char message = 0;
    const char *failure = "counter-or-handshake-unavailable";
    int complete = 0, status = 0;
    if (!byte_io(replies[0], &message, 0) || message != 'B' || !read_counter(child, &before)) goto cleanup;
    message = 'T';
    if (!byte_io(commands[1], &message, 1) || !byte_io(replies[0], &message, 0) || message != 'H' || !read_counter(child, &held)) goto cleanup;
    message = 'R';
    if (!byte_io(commands[1], &message, 1) || !byte_io(replies[0], &message, 0) || message != 'R' || !read_counter(child, &released)) goto cleanup;
    message = 'Q';
    if (!byte_io(commands[1], &message, 1)) goto cleanup;
    while (waitpid(child, &status, 0) < 0) { if (errno != EINTR) goto cleanup; }
    child = -1;
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) goto cleanup;
    complete = 1;
cleanup:
    close(commands[1]); close(replies[0]);
    // Only our just-forked child is ever signalled; no Clutter process is touched.
    if (child > 0) { kill(child, SIGKILL); while (waitpid(child, &status, 0) < 0 && errno == EINTR) {} }
    if (!complete) { printf("{\"status\":\"%s\"}\n", failure); return 2; }
    int identity = before.ri_proc_start_abstime != 0 && before.ri_proc_start_abstime == held.ri_proc_start_abstime && held.ri_proc_start_abstime == released.ri_proc_start_abstime;
    uint64_t delta = held.ri_phys_footprint > before.ri_phys_footprint ? held.ri_phys_footprint - before.ri_phys_footprint : 0;
    // Instrument sanity tolerance, NOT a product memory budget or benchmark.
    int observed = identity && delta >= ALLOCATION_BYTES * 3 / 4;
    printf("{\"format\":\"clutter-phys-counter38\",\"status\":\"%s\",\"api\":\"proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint\",\"units\":\"bytes\",\"crossProcessRead\":true,\"sameProcessIdentity\":%s,\"allocatedBytes\":%llu,\"beforeBytes\":%" PRIu64 ",\"heldBytes\":%" PRIu64 ",\"releasedBytes\":%" PRIu64 ",\"deltaBytes\":%" PRIu64 ",\"hostRanking\":\"not-qualified\"}\n", observed ? "counter-change-observed" : "counter-calibration-inconclusive", identity ? "true" : "false", ALLOCATION_BYTES, before.ri_phys_footprint, held.ri_phys_footprint, released.ri_phys_footprint, delta);
    return observed ? 0 : 2;
}
#endif
int main(int argc, char **argv) {
    if (argc != 2 || strcmp(argv[1], "--self-test") != 0) { puts("{\"status\":\"use-self-test\"}"); return 2; }
#if defined(__APPLE__)
    return calibrate();
#else
    puts("{\"status\":\"mac-required\",\"memory\":\"not-run\"}");
    return 2;
#endif
}
