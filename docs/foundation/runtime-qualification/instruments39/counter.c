// Reuse the Mac API and calibrated child test from38; do not copy its implementation.
#define main calibration_main38
#include "../instruments38/physical-footprint.c"
#undef main
#if defined(__APPLE__)
#include <limits.h>
static void json_path(const char *value) {
    putchar('"');
    for (const unsigned char *p=(const unsigned char *)value; *p; p++) {
        if (*p=='"' || *p=='\\') { putchar('\\'); putchar(*p); }
        else if (*p<32) printf("\\u%04x",(unsigned)*p);
        else putchar(*p);
    }
    putchar('"');
}
#endif
int main(int argc, char **argv) {
    if (argc==2 && strcmp(argv[1],"--self-test")==0) return calibration_main38(argc,argv);
#if defined(__APPLE__)
    if (argc<3 || argc>258 || strcmp(argv[1],"--pids")!=0) { puts("{\"status\":\"use-pids-max256\"}"); return 2; }
    pid_t pids[256];
    for (int i=2;i<argc;i++) {
        char *end=NULL; errno=0; long number=strtol(argv[i],&end,10);
        if (errno || !end || *end || number<1 || number>INT_MAX) { puts("{\"status\":\"invalid-pid\"}"); return 2; }
        pids[i-2]=(pid_t)number;
    }
    printf("{\"format\":\"clutter-process-counter39\",\"api\":\"proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint\",\"units\":\"bytes\",\"processes\":[");
    for (int i=2;i<argc;i++) {
        pid_t pid=pids[i-2]; struct rusage_info_v4 first,second;
        char path[PROC_PIDPATHINFO_MAXSIZE]={0};
        int ok=read_counter(pid,&first) && proc_pidpath(pid,path,sizeof(path))>0 && read_counter(pid,&second) && first.ri_proc_start_abstime!=0 && first.ri_proc_start_abstime==second.ri_proc_start_abstime;
        if(i>2)putchar(',');
        if(ok) {
            printf("{\"pid\":%d,\"status\":\"read\",\"startTicks\":\"%" PRIu64 "\",\"physicalFootprintBytes\":%" PRIu64 ",\"executable\":",pid,second.ri_proc_start_abstime,second.ri_phys_footprint);
            json_path(path);putchar('}');
        } else printf("{\"pid\":%d,\"status\":\"unavailable-or-changed\"}",pid);
    }
    puts("]}");return 0;
#else
    (void)argc; (void)argv; puts("{\"status\":\"mac-required\"}");return 2;
#endif
}
