using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

// 1. CONFIGURE CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy => 
        policy.WithOrigins("http://localhost:4200") // SignalR works better with explicit origins
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials()); // Required for SignalR
});

// 2. Add SignalR
builder.Services.AddSignalR();

// Ensure the app listens on the port provided by the environment (e.g., Render/Azure)
var port = Environment.GetEnvironmentVariable("PORT") ?? "5202";
builder.WebHost.UseUrls($"http://*:{port}");

var app = builder.Build();

app.UseCors("AllowAll");

// 5. Map SignalR Hub
app.MapHub<DocumentHub>("/documentHub");

// 6. SIMULATED DATABASE (Static Memory Dictionary)
var store = new DocumentStore();
const int LockDurationSeconds = 600; // Central variable for lock timeout

// 7. Endpoints
app.MapGet("/", () => "API is running!"); 

// --- GET ALL DOCUMENTS ---
app.MapGet("/documents", () => {
    var now = DateTime.UtcNow;
    return Results.Ok(store.Documents.Values.Select(d => new { 
        d.Id, 
        d.Title, 
        IsLocked = d.LockedUntil > now,
        LockedBy = d.LockedUntil > now ? d.LockedBy : null
    }));
});

// --- CREATE NEW DOCUMENT ---
app.MapPost("/documents", async (IHubContext<DocumentHub> hub) => {
    var id = Guid.NewGuid().ToString();
    var doc = new Document(id, "Untitled Document", "", 1);
    store.Documents[id] = doc;
    
    // Broadcast creation
    await hub.Clients.All.SendAsync("DocumentCreated", id);
    
    return Results.Created($"/documents/{id}", doc);
});

// --- GET SPECIFIC DOCUMENT (CLAIM LOCK) ---
app.MapGet("/documents/{id}", async (string id, string? userName, IHubContext<DocumentHub> hub) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    // Auto-Lock when fetching for editing
    if (!string.IsNullOrEmpty(userName)) {
        var now = DateTime.UtcNow;
        if (doc.LockedUntil < now || doc.LockedBy == userName) {
            doc = doc with { LockedBy = userName, LockedUntil = now.AddSeconds(LockDurationSeconds) };
            store.Documents[id] = doc;
            Console.WriteLine($"[LOCKED] Doc {id} by {userName} until {doc.LockedUntil}");
            
            // Broadcast lock change
            await hub.Clients.All.SendAsync("LockChanged", id, true, userName);
        }
    }
    
    return Results.Ok(doc);
});

// --- SAVE/UPDATE DOCUMENT ---
app.MapPut("/documents/{id}", async (string id, string? userName, Document updatedDoc, IHubContext<DocumentHub> hub) => {
    if (!store.Documents.TryGetValue(id, out var existingDoc)) return Results.NotFound();

    var now = DateTime.UtcNow;
    if (existingDoc.LockedUntil > now && existingDoc.LockedBy != userName) {
        return Results.Json(new { message = "Document is locked by " + existingDoc.LockedBy }, statusCode: 423);
    }

    if (updatedDoc.Version != existingDoc.Version) {
        return Results.Conflict(new { message = "409 Conflict", serverVersion = existingDoc.Version });
    }

    var newDoc = updatedDoc with { 
        Version = updatedDoc.Version + 1,
        LockedBy = userName,
        LockedUntil = now.AddSeconds(LockDurationSeconds)
    };
    store.Documents[id] = newDoc;
    Console.WriteLine($"[SAVED] Doc {id} - New Server Version: {newDoc.Version}");
    
    // Broadcast update
    await hub.Clients.All.SendAsync("DocumentUpdated", id, newDoc.Version, userName);
    
    return Results.Ok(new { version = newDoc.Version });
});

// --- DELETE DOCUMENT ---
app.MapDelete("/documents/{id}", async (string id, string? userName, IHubContext<DocumentHub> hub) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();

    var now = DateTime.UtcNow;
    if (doc.LockedUntil > now && doc.LockedBy != userName) {
        return Results.Json(new { message = "Cannot delete: Document is locked by " + doc.LockedBy }, statusCode: 423);
    }

    store.Documents.Remove(id);
    Console.WriteLine($"[DELETED] Doc {id} removed. Broadcasting...");
    
    // Broadcast deletion
    await hub.Clients.All.SendAsync("DocumentDeleted", id);
    
    return Results.NoContent();
});

// --- HEARTBEAT / RENEW LOCK ---
app.MapPost("/documents/{id}/heartbeat", async (string id, string userName, IHubContext<DocumentHub> hub) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    var now = DateTime.UtcNow;
    if (doc.LockedUntil < now || doc.LockedBy == userName) {
        doc = doc with { LockedBy = userName, LockedUntil = now.AddSeconds(LockDurationSeconds) };
        store.Documents[id] = doc;
        
        // Broadcast lock renewal
        await hub.Clients.All.SendAsync("LockChanged", id, true, userName);
        
        return Results.Ok(new { lockedUntil = doc.LockedUntil });
    }
    
    return Results.Json(new { message = "Lock lost to " + doc.LockedBy }, statusCode: 423);
});

// --- UNLOCK DOCUMENT (INSTANT RELEASE) ---
app.MapPost("/documents/{id}/unlock", async (string id, string? userName, IHubContext<DocumentHub> hub) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    // Allow unlock if: user owns the lock, OR the lock has already expired
    if (doc.LockedBy == userName || doc.LockedUntil == null || doc.LockedUntil < DateTime.UtcNow) {
        doc = doc with { LockedBy = null, LockedUntil = null };
        store.Documents[id] = doc;
        Console.WriteLine($"[UNLOCKED] Doc {id} released by {userName}.");
        
        // Broadcast release
        await hub.Clients.All.SendAsync("LockChanged", id, false, null);
        
        return Results.Ok();
    }
    return Results.BadRequest("You do not hold the lock for this document.");
});

app.Run();

// 8. Hub & Models
public class DocumentHub : Hub { }

public record Document(
    string Id, 
    string Title, 
    string Content, 
    int Version, 
    DateTime? LockedUntil = null, 
    string? LockedBy = null
);

public class DocumentStore {
    public Dictionary<string, Document> Documents { get; set; } = new () {
        { "initial-doc", new Document("initial-doc", "My First Document", "Hello from the multi-document store!", 1) }
    };
}
